import { Kms, type Agent, type AgentContext } from '@credo-ts/core'
import { describe, expect, it } from 'vitest'

import { WebCryptoKeyManagementService } from '../../credo/WebCryptoKeyManagementService'
import { createJwkHolderBinding } from '../receive'

const context = {} as AgentContext

describe('createJwkHolderBinding', () => {
  it('binds the credential request to a non-extractable P-256 public JWK', async () => {
    const kms = new WebCryptoKeyManagementService(`heka-wallet-kms-${crypto.randomUUID()}`)
    const agent = {
      kms: {
        createKey: (options: Parameters<WebCryptoKeyManagementService['createKey']>[1]) => kms.createKey(context, options),
      },
    } as unknown as Agent

    const binding = await createJwkHolderBinding(agent)

    expect(binding.method).toBe('jwk')
    expect(binding.keys).toHaveLength(1)
    expect(binding.keys[0]).toBeInstanceOf(Kms.PublicJwk)
    expect(binding.keys[0].kty).toBe('EC')
    expect(binding.keys[0].getJwkThumbprint().byteLength).toBeGreaterThan(0)
  })
})
