import { generateKeyPairSync } from 'node:crypto'

import { AgentContext, Kms } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { getListFromStatusListJWT, StatusType } from '@owf/token-status-list'

import { AuthInfo } from 'common/auth'
import { defaultTokenStatusListSize, TokenStatusList } from 'common/entities'
import { Logger } from 'common/logger'
import ExpressConfig from 'config/express'

import { TokenStatusListService, TokenStatusListSignerIdentity } from '../token-status-list.service'

const b64url = (value: string | Uint8Array): string => Buffer.from(value).toString('base64url')
const decodeJwt = (jwt: string) => {
  const [header, payload] = jwt.split('.')
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>,
  }
}

describe('TokenStatusListService', () => {
  const p256 = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' })
  const identity: TokenStatusListSignerIdentity = {
    issuer: 'https://issuer.example',
    keyId: 'kms-key-1',
    signer: { method: 'x5c', x5c: ['LEAF', 'ROOT'] },
  }
  const authInfo = { user: { id: 'user-1' } } as unknown as AuthInfo

  let service: TokenStatusListService
  let em: EntityManager
  let agentContext: AgentContext
  let stored: TokenStatusList[]
  const sign = vi.fn()

  beforeEach(() => {
    stored = []
    em = createMock<EntityManager>({
      find: vi.fn((_entity: unknown, where: { signerKeyId?: string }) =>
        Promise.resolve(stored.filter((list) => !where.signerKeyId || list.signerKeyId === where.signerKeyId)),
      ),
      findOne: vi.fn((_entity: unknown, where: { id: string }) =>
        Promise.resolve(stored.find((list) => list.id === where.id) ?? null),
      ),
      findOneOrFail: vi.fn((_entity: unknown, where: { id: string }) => {
        const found = stored.find((list) => list.id === where.id)
        if (!found) throw new Error('not found')
        return Promise.resolve(found)
      }),
      persist: vi.fn((entity: TokenStatusList) => {
        stored.push(entity)
        return em
      }),
      flush: vi.fn().mockResolvedValue(undefined),
    } as never)

    // The KMS: a real P-256 public key (so the JWA algorithm resolves to ES256) and a fake signature.
    sign.mockReset()
    sign.mockResolvedValue({ signature: Uint8Array.from(Buffer.from('sig')) })
    const kms = { getPublicKey: vi.fn().mockResolvedValue({ ...p256, kid: 'kms-key-1' }), sign }
    agentContext = {
      contextCorrelationId: 'tenant-1',
      resolve: vi.fn((token: unknown) => (token === Kms.KeyManagementApi ? kms : undefined)),
    } as unknown as AgentContext

    service = new TokenStatusListService(
      em,
      { appEndpoint: 'https://heka.example' } as ConfigType<typeof ExpressConfig>,
      createMock<Logger>(),
    )
  })

  test('allocate creates a signed list on first use and reserves a random index in it', async () => {
    const reference = await service.allocate(agentContext, authInfo, identity)

    expect(stored).toHaveLength(1)
    const list = stored[0]
    expect(reference).toEqual({
      id: list.id,
      uri: `https://heka.example/token-status-lists/${list.id}`,
      idx: reference.idx,
    })
    expect(reference.idx).toBeGreaterThanOrEqual(0)
    expect(reference.idx).toBeLessThan(defaultTokenStatusListSize)
    expect(list).toMatchObject({
      issuer: 'https://issuer.example',
      signerKeyId: 'kms-key-1',
      tenantContextId: 'tenant-1',
      signer: { method: 'x5c', x5c: ['LEAF', 'ROOT'] },
      bitsPerStatus: 1,
      size: defaultTokenStatusListSize,
      allocatedCount: 1,
    })

    // signed with the credential-signing key, as statuslist+jwt, with the issuer's x5c
    expect(sign).toHaveBeenCalledTimes(1)
    expect(sign.mock.calls[0][0]).toMatchObject({ keyId: 'kms-key-1', algorithm: 'ES256' })
    const { header, payload } = decodeJwt(list.token!)
    expect(header).toMatchObject({ alg: 'ES256', typ: 'statuslist+jwt', x5c: ['LEAF', 'ROOT'] })
    expect(list.token!.endsWith(`.${b64url('sig')}`)).toBe(true)
    expect(payload).toMatchObject({
      iss: 'https://issuer.example',
      sub: `https://heka.example/token-status-lists/${list.id}`,
      iat: expect.any(Number),
      ttl: 300,
      status_list: { bits: 1, lst: expect.any(String) },
    })
    expect(getListFromStatusListJWT(list.token!).getStatus(reference.idx)).toBe(StatusType.Valid)
  })

  test('allocate reuses the list of the same signing key and never hands out an index twice', async () => {
    const first = await service.allocate(agentContext, authInfo, identity)
    const second = await service.allocate(agentContext, authInfo, identity)

    expect(stored).toHaveLength(1)
    expect(stored[0].allocatedCount).toBe(2)
    expect(first.id).toBe(second.id)
    expect(first.idx).not.toBe(second.idx)
    // reserving indexes does not change any status → no re-signing
    expect(sign).toHaveBeenCalledTimes(1)
  })

  test('a different signing key (rotated issuer certificate) starts a separate list', async () => {
    await service.allocate(agentContext, authInfo, identity)
    await service.allocate(agentContext, authInfo, {
      ...identity,
      keyId: 'kms-key-2',
      signer: { method: 'x5c', x5c: ['LEAF2', 'ROOT'] },
    })

    expect(stored.map((list) => list.signerKeyId)).toEqual(['kms-key-1', 'kms-key-2'])
  })

  test('a DID issuer signs with kid instead of x5c', async () => {
    await service.allocate(agentContext, authInfo, {
      issuer: 'did:key:z6MkIssuer',
      keyId: 'kms-key-did',
      signer: { method: 'did', kid: 'did:key:z6MkIssuer#z6MkIssuer' },
    })
    const { header, payload } = decodeJwt(stored[0].token!)
    expect(header).toMatchObject({ kid: 'did:key:z6MkIssuer#z6MkIssuer', typ: 'statuslist+jwt' })
    expect(header.x5c).toBeUndefined()
    expect(payload.iss).toBe('did:key:z6MkIssuer')
  })

  test('setStatus flips the entry and re-signs the token', async () => {
    const reference = await service.allocate(agentContext, authInfo, identity)
    const before = stored[0].token

    await service.setStatus(agentContext, authInfo, reference.id, reference.idx, StatusType.Invalid)

    expect(sign).toHaveBeenCalledTimes(2)
    expect(stored[0].token).not.toBe(before)
    const list = getListFromStatusListJWT(stored[0].token!)
    expect(list.getStatus(reference.idx)).toBe(StatusType.Invalid)
    expect(list.getStatus((reference.idx + 1) % defaultTokenStatusListSize)).toBe(StatusType.Valid)
    expect(await service.getToken(reference.id)).toBe(stored[0].token)
  })

  test('setStatus rejects an out-of-range index', async () => {
    const reference = await service.allocate(agentContext, authInfo, identity)
    await expect(
      service.setStatus(agentContext, authInfo, reference.id, defaultTokenStatusListSize, StatusType.Invalid),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  test('re-signing is refused outside the tenant context that owns the key', async () => {
    const reference = await service.allocate(agentContext, authInfo, identity)
    const otherContext = { ...agentContext, contextCorrelationId: 'tenant-2' } as unknown as AgentContext
    await expect(
      service.setStatus(otherContext, authInfo, reference.id, reference.idx, StatusType.Invalid),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  test('getToken of an unknown list is a 404', async () => {
    await expect(service.getToken('nope')).rejects.toBeInstanceOf(NotFoundException)
  })

  test('a full list is not reused — a new one is created', async () => {
    const reference = await service.allocate(agentContext, authInfo, identity)
    stored[0].allocatedCount = stored[0].size // pretend every index is taken

    const next = await service.allocate(agentContext, authInfo, identity)

    expect(stored).toHaveLength(2)
    expect(next.id).not.toBe(reference.id)
  })
})
