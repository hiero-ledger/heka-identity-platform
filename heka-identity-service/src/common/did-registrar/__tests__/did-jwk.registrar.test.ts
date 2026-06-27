import { createMock } from '@golevelup/ts-vitest'

import { TenantAgent } from 'common/agent'

import { DidJwkRegistrar } from '../methods/did-jwk'

describe('DidJwkRegistrar', () => {
  let registrar: DidJwkRegistrar
  let tenantAgent: TenantAgent

  const mockCreateKey = vi.fn()
  const mockDidsCreate = vi.fn()

  beforeEach(() => {
    registrar = new DidJwkRegistrar()
    mockCreateKey.mockReset()
    mockDidsCreate.mockReset()

    tenantAgent = createMock<TenantAgent>({
      kms: { createKey: mockCreateKey },
      dids: { create: mockDidsCreate },
    })
  })

  test('registers under the jwk method', () => {
    expect(DidJwkRegistrar.method).toBe('jwk')
  })

  test('mints an EC P-256 key and a did:jwk bound to that key', async () => {
    mockCreateKey.mockResolvedValue({
      keyId: 'kms-key-1',
      publicJwk: { kty: 'EC', crv: 'P-256', kid: 'kms-key-1' },
    })
    const didResult = { didState: { state: 'finished', did: 'did:jwk:abc' } }
    mockDidsCreate.mockResolvedValue(didResult)

    const result = await registrar.createDid(tenantAgent, {})

    expect(mockCreateKey).toHaveBeenCalledWith({ type: { kty: 'EC', crv: 'P-256' } })
    expect(mockDidsCreate).toHaveBeenCalledWith({ method: 'jwk', options: { keyId: 'kms-key-1' } })
    expect(result).toBe(didResult)
  })
})
