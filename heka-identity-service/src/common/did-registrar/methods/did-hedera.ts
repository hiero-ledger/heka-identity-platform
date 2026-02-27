import type { DidCreateResult } from '@credo-ts/core'

import { TenantAgent } from '../../agent'
import { CreateDidOptions, DidRegistrar } from '../did-registrar.types'

export class DidHederaRegistrar implements DidRegistrar {
  public static readonly method = 'hedera'

  public createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult> {
    return tenantAgent.dids.create({
      method: DidHederaRegistrar.method,
    })
  }
}
