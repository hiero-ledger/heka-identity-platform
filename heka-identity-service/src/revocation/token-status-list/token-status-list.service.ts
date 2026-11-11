import type { EntityManager as PostgreSqlEntityManager } from '@mikro-orm/postgresql'

import { randomInt } from 'node:crypto'

import { AgentContext, Kms } from '@credo-ts/core'
import { EntityManager, LockMode } from '@mikro-orm/core'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { BitsPerStatus, createHeaderAndPayload, StatusList } from '@owf/token-status-list'

import { AuthInfo } from 'common/auth'
import {
  defaultTokenStatusListBits,
  defaultTokenStatusListSize,
  TokenStatusList,
  TokenStatusListSigner,
} from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import ExpressConfig from 'config/express'

/** The credential-signing identity a list is created for. */
export interface TokenStatusListSignerIdentity {
  /** `iss` of the referenced credentials (DID or https issuer URL). */
  issuer: string
  /** KMS key id, in the calling tenant's store, of the key that signs the referenced credentials. */
  keyId: string
  /** Header material that identifies that key to verifiers (`x5c` chain or `kid`). */
  signer: TokenStatusListSigner
}

/** The entries reserved for one (batch) issuance — all in the same list, one per credential. */
export interface ReservedTokenStatusListIndexes {
  id: string
  uri: string
  indexes: number[]
}

/** Entries of one list, as referenced by the credentials of an issuance. */
export interface TokenStatusListEntries {
  id: string
  indexes: number[]
}

/** `ttl` claim: how long a verifier may cache a token before re-fetching. */
export const TOKEN_STATUS_LIST_TTL_SECONDS = 300

/** Media type of a Status List Token in JWT format (draft-ietf-oauth-status-list). */
export const TOKEN_STATUS_LIST_JWT_MEDIA_TYPE = 'application/statuslist+jwt'

/** Status values (draft-ietf-oauth-status-list §7.1). `Suspended` needs a 2-bit list. */
export enum TokenStatus {
  Valid = 0,
  Invalid = 1,
  Suspended = 2,
}

/**
 * IETF Token Status Lists (draft-ietf-oauth-status-list) for SD-JWT VCs, replacing the W3C bitstring list for
 * that format (`StatusListService` stays for W3C VCs). Built on `@owf/token-status-list`, the library Credo
 * itself verifies status lists with.
 *
 * - One list per (tenant, signing key). Credo verifies a Status List Token with the **referenced credential's
 *   issuer key**, so the list is signed with exactly the key that signed the credentials pointing to it.
 *   Lists belong to the tenant (wallet) that holds the key, so every member of a shared wallet can revoke
 *   the credentials another member issued; `owner` only records who created the list.
 * - Indexes are drawn at random from the list (herd privacy); a list is full when every index is taken.
 * - The signed token is stored on the entity and served verbatim by the tenant-less public route, so
 *   signing happens only inside tenant-context operations (offer / revoke) where the key is reachable.
 * - Allocation is serialised per (tenant, signing key) by a transaction-scoped Postgres advisory lock, taken
 *   before the key's lists are read: concurrent offers never get the same index, and a key with no list (or
 *   only full ones) gets exactly one new list, even though there is no row to lock yet.
 * - Status changes lock the affected list rows, in id order, for the whole read-check-write: concurrent
 *   revocations never drop each other's bit, and only one of them sees an entry change.
 * - Allocation holds the advisory lock and at most one list row; status changes take list row locks only, in
 *   id order. No lock cycle is possible, so the two paths cannot deadlock.
 */
@Injectable()
export class TokenStatusListService {
  public constructor(
    private readonly em: EntityManager,
    @Inject(ExpressConfig.KEY)
    private readonly appConfig: ConfigType<typeof ExpressConfig>,
    @InjectLogger(TokenStatusListService)
    private readonly logger: Logger,
  ) {}

  /** Public download URI of a list — the `uri` inside the referenced credentials. */
  public location(id: string): string {
    return `${this.appConfig.appEndpoint}/token-status-lists/${id}`
  }

  /**
   * Reserve `count` distinct indexes — one per credential of a batch issuance — in a single list of
   * `identity`'s key (creating a list when none has room). One locked transaction, so concurrent offers
   * never share an entry and neither do the credentials of one batch.
   */
  public async reserveIndexes(
    agentContext: AgentContext,
    authInfo: AuthInfo,
    identity: TokenStatusListSignerIdentity,
    count: number,
  ): Promise<ReservedTokenStatusListIndexes> {
    if (!Number.isInteger(count) || count < 1) {
      throw new BadRequestException('At least one status list entry must be reserved')
    }
    const tenantContextId = agentContext.contextCorrelationId
    return this.em.transactional(async (em) => {
      // Held until commit; only allocations for the same (tenant, key) wait on it
      await (em as PostgreSqlEntityManager).execute('select pg_advisory_xact_lock(hashtextextended(?, 0))', [
        allocationLockKey(tenantContextId, identity.keyId),
      ])
      // No row locks needed: every writer of `allocatedBitmap` / `allocatedCount` holds the advisory lock, and the
      // update below changes only those columns, so it cannot lose a concurrent status change.
      const lists = await em.find(
        TokenStatusList,
        { tenantContextId, signerKeyId: identity.keyId },
        { orderBy: { id: 'asc' } },
      )
      let list = lists.find((candidate) => candidate.allocatedCount + count <= candidate.size)
      if (!list) {
        list = await this.create(em, agentContext, authInfo, identity)
      }

      const allocated = fromBase64(list.allocatedBitmap)
      const indexes: number[] = []
      for (let reserved = 0; reserved < count; reserved += 1) {
        const idx = pickFreeIndex(allocated, list.size)
        setBit(allocated, idx)
        indexes.push(idx)
      }
      list.allocatedBitmap = toBase64(allocated)
      list.allocatedCount += count
      await em.flush()

      this.logger.child('allocate').debug({ id: list.id, indexes }, 'indexes reserved')
      return { id: list.id, uri: this.location(list.id), indexes }
    })
  }

  /**
   * Set the status of several entries of one list (all credentials of a batch) and re-sign the token once, if
   * anything changed. Only lists of the calling tenant are found; any other id is a 404.
   */
  public async setStatuses(
    agentContext: AgentContext,
    id: string,
    indexes: readonly number[],
    status: TokenStatus,
  ): Promise<void> {
    await this.setEntryStatuses(agentContext, [{ id, indexes: [...indexes] }], status)
  }

  /**
   * Set `status` on every given entry, across lists, in one transaction that holds the lists' row locks (taken in
   * id order) from the read to the write. Lists whose entries already have that status are left as they are (not
   * re-signed). Returns whether any entry changed, so callers can tell "already done" apart, race-free.
   * Only lists of the calling tenant are found; any other id is a 404 and nothing changes.
   */
  public async setEntryStatuses(
    agentContext: AgentContext,
    entries: readonly TokenStatusListEntries[],
    status: TokenStatus,
  ): Promise<boolean> {
    const requested = new Map<string, number[]>()
    for (const { id, indexes } of entries) requested.set(id, [...(requested.get(id) ?? []), ...indexes])
    if (requested.size === 0 || [...requested.values()].some((indexes) => indexes.length === 0)) {
      throw new BadRequestException('At least one status list index is required')
    }

    return this.em.transactional(async (em) => {
      const lists = await em.find(
        TokenStatusList,
        { id: { $in: [...requested.keys()] }, tenantContextId: agentContext.contextCorrelationId },
        { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } },
      )
      if (lists.length !== requested.size) throw new NotFoundException('Status list not found')

      const changes: Array<{ list: TokenStatusList; statusList: StatusList; indexes: number[] }> = []
      for (const list of lists) {
        const indexes = requested.get(list.id)!
        for (const idx of indexes) {
          if (!Number.isInteger(idx) || idx < 0 || idx >= list.size) {
            throw new BadRequestException('Status list index is out of bounds')
          }
        }
        // Checked before `setStatus` (which throws a plain Error) so an oversized value is a 400, not a 500.
        if (!Number.isInteger(status) || status < 0 || status >= 2 ** list.bitsPerStatus) {
          throw new BadRequestException(`Status ${status} does not fit a ${list.bitsPerStatus}-bit status list`)
        }
        const statusList = this.decode(list)
        // The library types entries as its own `StatusType` enum; compare the plain numbers.
        const value: number = status
        if (indexes.some((idx) => statusList.getStatus(idx).valueOf() !== value)) {
          changes.push({ list, statusList, indexes })
        }
      }

      for (const { list, statusList, indexes } of changes) {
        for (const idx of indexes) statusList.setStatus(idx, status)
        list.encodedStatuses = encodeStatuses(statusList)
        await this.sign(agentContext, list, statusList)
        this.logger.child('setEntryStatuses').debug({ id: list.id, indexes, status }, 'statuses set')
      }
      await em.flush()
      return changes.length > 0
    })
  }

  /**
   * Current statuses of the given entries, read in one query from the calling tenant's lists. The value for a
   * list id is aligned with the `indexes` passed for it (concatenated in order when an id is passed twice).
   * Lists that do not exist, or belong to another tenant, are absent from the result.
   */
  public async getStatuses(
    agentContext: AgentContext,
    refs: readonly TokenStatusListEntries[],
  ): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>()
    if (refs.length === 0) return result

    const requested = new Map<string, number[]>()
    for (const ref of refs) requested.set(ref.id, [...(requested.get(ref.id) ?? []), ...ref.indexes])

    const lists = await this.em.find(TokenStatusList, {
      id: { $in: [...requested.keys()] },
      tenantContextId: agentContext.contextCorrelationId,
    })
    for (const list of lists) {
      const indexes = requested.get(list.id) ?? []
      for (const idx of indexes) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= list.size) {
          throw new BadRequestException('Status list index is out of bounds')
        }
      }
      const statusList = this.decode(list)
      result.set(
        list.id,
        indexes.map((idx) => statusList.getStatus(idx)),
      )
    }
    return result
  }

  /** The current signed Status List Token of a list (public, tenant-less). */
  public async getToken(id: string): Promise<string> {
    const list = await this.em.findOne(TokenStatusList, { id })
    // Static message: this is a public route, so the error never echoes the caller's input
    if (!list?.token) throw new NotFoundException('Token status list not found')
    return list.token
  }

  private async create(
    em: EntityManager,
    agentContext: AgentContext,
    authInfo: AuthInfo,
    identity: TokenStatusListSignerIdentity,
  ): Promise<TokenStatusList> {
    const size = defaultTokenStatusListSize
    const bits = defaultTokenStatusListBits as BitsPerStatus
    const statusList = new StatusList(new Array<number>(size).fill(TokenStatus.Valid), bits)
    const list = new TokenStatusList({
      issuer: identity.issuer,
      signerKeyId: identity.keyId,
      tenantContextId: agentContext.contextCorrelationId,
      signer: identity.signer,
      bitsPerStatus: bits,
      size,
      allocatedBitmap: toBase64(new Uint8Array(Math.ceil(size / 8))),
      encodedStatuses: encodeStatuses(statusList),
      owner: authInfo.user,
    })
    await this.sign(agentContext, list, statusList)
    em.persist(list)
    await em.flush()
    this.logger.child('create').info({ id: list.id, issuer: identity.issuer }, 'token status list created')
    return list
  }

  private decode(list: TokenStatusList): StatusList {
    return StatusList.decompressStatusListFromBytes(
      Uint8Array.from(Buffer.from(list.encodedStatuses, 'base64url')),
      list.bitsPerStatus as BitsPerStatus,
    )
  }

  /** Sign `statuslist+jwt` with the list's key, in the tenant context that holds it. */
  private async sign(agentContext: AgentContext, list: TokenStatusList, statusList: StatusList): Promise<void> {
    if (agentContext.contextCorrelationId !== list.tenantContextId) {
      throw new BadRequestException('Token status list can only be re-signed in the tenant context that owns its key')
    }
    const kms = agentContext.resolve(Kms.KeyManagementApi)
    const key = await kms.getPublicKey({ keyId: list.signerKeyId })
    if (!key || key.kty === 'oct') {
      throw new BadRequestException('Token status list signing key is missing or not an asymmetric key')
    }
    const alg = Kms.PublicJwk.fromPublicJwk(key).supportedSignatureAlgorithms[0]
    if (!alg) throw new BadRequestException('Token status list signing key supports no JWA signature algorithm')

    const issuedAt = new Date()
    const { header, payload } = createHeaderAndPayload(
      statusList,
      {
        iss: list.issuer,
        sub: this.location(list.id),
        iat: Math.floor(issuedAt.getTime() / 1000),
        ttl: TOKEN_STATUS_LIST_TTL_SECONDS,
      },
      {
        alg,
        typ: 'statuslist+jwt',
        ...(list.signer.method === 'x5c' ? { x5c: list.signer.x5c } : { kid: list.signer.kid }),
      },
    )

    // createHeaderAndPayload does not sign: KMS-sign the JWS signing input ourselves.
    const signingInput = `${base64Url(JSON.stringify({ ...header, alg }))}.${base64Url(JSON.stringify(payload))}`
    const { signature } = await kms.sign({
      keyId: list.signerKeyId,
      algorithm: alg,
      data: Uint8Array.from(Buffer.from(signingInput, 'utf8')),
    })
    list.token = `${signingInput}.${base64Url(signature)}`
    list.tokenIssuedAt = issuedAt
  }
}

/** Advisory lock key of the allocations for one signing key of one tenant. */
function allocationLockKey(tenantContextId: string, signerKeyId: string): string {
  return `token-status-list:${tenantContextId}:${signerKeyId}`
}

/** The token's `lst` value: the compressed list, base64url-encoded. */
function encodeStatuses(statusList: StatusList): string {
  return base64Url(statusList.compressStatusListToBytes())
}

function base64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'))
}

function isSet(bitmap: Uint8Array, index: number): boolean {
  return (bitmap[index >> 3] & (1 << (index & 7))) !== 0
}

function setBit(bitmap: Uint8Array, index: number): void {
  bitmap[index >> 3] |= 1 << (index & 7)
}

/**
 * A random unallocated index: a few random probes (cheap while the list is mostly empty), then a linear
 * scan from a random offset (guaranteed while any index is free). Callers check `allocatedCount < size`.
 */
function pickFreeIndex(bitmap: Uint8Array, size: number): number {
  for (let attempt = 0; attempt < 16; attempt++) {
    const candidate = randomInt(size)
    if (!isSet(bitmap, candidate)) return candidate
  }
  const start = randomInt(size)
  for (let offset = 0; offset < size; offset++) {
    const candidate = (start + offset) % size
    if (!isSet(bitmap, candidate)) return candidate
  }
  throw new BadRequestException('Token status list is full')
}
