import { randomInt } from 'node:crypto'

import { AgentContext, Kms } from '@credo-ts/core'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { BitsPerStatus, createHeaderAndPayload, StatusList } from '@sd-jwt/jwt-status-list'

import { AuthInfo } from 'common/auth'
import {
  defaultTokenStatusListBits,
  defaultTokenStatusListSize,
  TokenStatusList,
  TokenStatusListSigner,
} from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'
import ExpressConfig from 'config/express'

/** The signing identity of the credentials a list is created for — the list is signed with the same key. */
export interface TokenStatusListSignerIdentity {
  /** `iss` of the referenced credentials (DID or https issuer URL). */
  issuer: string
  /** KMS key id, in the calling tenant's store, of the key that signs the referenced credentials. */
  keyId: string
  /** Header material that identifies that key to verifiers (`x5c` chain or `kid`). */
  signer: TokenStatusListSigner
}

/** What a credential carries in its `status.status_list` claim. */
export interface TokenStatusListReference {
  id: string
  uri: string
  idx: number
}

/** `ttl` claim: how long a verifier may cache a token before re-fetching. */
export const TOKEN_STATUS_LIST_TTL_SECONDS = 300

/** Media type of a Status List Token in JWT format (draft-ietf-oauth-status-list). */
export const STATUS_LIST_JWT_MEDIA_TYPE = 'application/statuslist+jwt'

/** Status values (draft-ietf-oauth-status-list §7.1). `Suspended` needs a 2-bit list. */
export enum TokenStatus {
  Valid = 0,
  Invalid = 1,
  Suspended = 2,
}

/**
 * IETF Token Status Lists (draft-ietf-oauth-status-list) for SD-JWT VCs — the EUDI / HAIP revocation
 * mechanism, replacing the W3C bitstring list for that format (`StatusListService` stays for W3C VCs).
 * Built on `@sd-jwt/jwt-status-list` (the library Credo itself verifies status lists with); the OWF
 * `token-status-list` package was dropped because its `@owf/cose` dependency registers cbor-x tag extensions
 * that collide with `@owf/mdoc` and break every mdoc decode in the process.
 *
 * - One list per (owner, signing key). Credo verifies a Status List Token with the **referenced
 *   credential's issuer key**, so the list is signed with exactly the key that signed the credentials
 *   pointing to it; a rotated issuer certificate simply starts a new list.
 * - Indexes are drawn at random from the list (herd privacy); a list is full when every index is taken.
 * - The signed token is stored on the entity and served verbatim by the tenant-less public route, so
 *   signing happens only inside tenant-context operations (offer / revoke) where the key is reachable.
 * - Tokens carry `iat` + `ttl` and no `exp` (an unchanged list stays valid; verifiers re-fetch per ttl).
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

  /** Reserve one index for a credential about to be issued under `identity` (creating a list on first use). */
  public async allocate(
    agentContext: AgentContext,
    authInfo: AuthInfo,
    identity: TokenStatusListSignerIdentity,
  ): Promise<TokenStatusListReference> {
    const lists = await this.em.find(TokenStatusList, { owner: authInfo.user, signerKeyId: identity.keyId })
    let list = lists.find((candidate) => candidate.allocatedCount < candidate.size)
    if (!list) {
      list = await this.create(agentContext, authInfo, identity)
    }

    const allocated = fromBase64(list.allocated)
    const idx = pickFreeIndex(allocated, list.size)
    setBit(allocated, idx)
    list.allocated = toBase64(allocated)
    list.allocatedCount += 1
    await this.em.flush()

    this.logger.child('allocate').debug({ id: list.id, idx }, 'index reserved')
    return { id: list.id, uri: this.location(list.id), idx }
  }

  /** Set one entry's status (e.g. `TokenStatus.Invalid` to revoke) and re-sign the token. */
  public async setStatus(
    agentContext: AgentContext,
    authInfo: AuthInfo,
    id: string,
    idx: number,
    status: TokenStatus,
  ): Promise<void> {
    const list = await this.em.findOneOrFail(TokenStatusList, { id, owner: authInfo.user })
    if (!Number.isInteger(idx) || idx < 0 || idx >= list.size) {
      throw new BadRequestException('Status list index is out of bounds')
    }
    // The library does not range-check values on `setStatus`; an oversized one would corrupt the bit packing.
    if (!Number.isInteger(status) || status < 0 || status >= 2 ** list.bitsPerStatus) {
      throw new BadRequestException(`Status ${status} does not fit a ${list.bitsPerStatus}-bit status list`)
    }
    const statusList = this.decode(list)
    statusList.setStatus(idx, status)
    list.statuses = encodeStatuses(statusList)
    await this.sign(agentContext, list, statusList)
    await this.em.flush()
  }

  /** The current signed Status List Token of a list (public, tenant-less). */
  public async getToken(id: string): Promise<string> {
    const list = await this.em.findOne(TokenStatusList, { id })
    if (!list?.token) throw new NotFoundException(`Token status list ${id} not found`)
    return list.token
  }

  private async create(
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
      allocated: toBase64(new Uint8Array(Math.ceil(size / 8))),
      statuses: encodeStatuses(statusList),
      owner: authInfo.user,
    })
    await this.sign(agentContext, list, statusList)
    this.em.persist(list)
    await this.em.flush()
    this.logger.child('create').info({ id: list.id, issuer: identity.issuer }, 'token status list created')
    return list
  }

  private decode(list: TokenStatusList): StatusList {
    return StatusList.decompressStatusList(list.statuses, list.bitsPerStatus as BitsPerStatus)
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

    // Compact JWS over the JSON header + payload, signed with the credential-signing key (same pattern
    // as the scheme trust-list signer: KMS sign over the JWS signing input).
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

/** The compressed status array as the library's base64url string (the `lst` bytes). */
function encodeStatuses(statusList: StatusList): string {
  return statusList.compressStatusList()
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
