import type { DidCreateResult } from '@credo-ts/core'

import { KeyDidCreateOptions } from '@credo-ts/core'

import { TenantAgent } from '../../agent'
import { CreateDidOptions, DidRegistrar } from '../did-registrar.types'

export class DidKeyRegistrar implements DidRegistrar {
  public static readonly method = 'key'

  public async createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult> {
    const keyResult = await tenantAgent.kms.createKey({
      type: {
        kty: 'OKP',
        crv: 'Ed25519',
      },
    })

    return await tenantAgent.dids.create<KeyDidCreateOptions>({
      method: DidKeyRegistrar.method,
      options: {
        keyId: keyResult.keyId,
      },
    })
  }
}
