import type { DidCreateResult } from '@credo-ts/core'

import { JwkDidCreateOptions } from '@credo-ts/core'

import { TenantAgent } from '../../agent'
import { CreateDidOptions, DidRegistrar } from '../did-registrar.types'

export class DidJwkRegistrar implements DidRegistrar {
  public static readonly method = 'jwk'

  /**
   * Creates a did:jwk for the tenant.
   *
   * Defaults to EC P-256 so the underlying key is HAIP / X.509-friendly and can also back an
   * X.509 request-signing certificate — unlike did:key, which uses Ed25519 and produces EdDSA
   * signatures that many platform / EUDI wallets reject. See
   * `x509-context/x509-signing-implementation-plan.md` §2.1 / §6.2.
   */
  public async createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult> {
    const keyResult = await tenantAgent.kms.createKey({
      type: {
        kty: 'EC',
        crv: 'P-256',
      },
    })

    return await tenantAgent.dids.create<JwkDidCreateOptions>({
      method: DidJwkRegistrar.method,
      options: {
        keyId: keyResult.keyId,
      },
    })
  }
}
