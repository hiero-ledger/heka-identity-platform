import type { DidCreateResult } from '@credo-ts/core'

import { DidDocument } from '@credo-ts/core'
import { HederaDidCreateOptions } from '@credo-ts/hedera'

import { TenantAgent } from '../../agent'
import { CreateDidOptions, DidRegistrar } from '../did-registrar.types'

export class DidHederaRegistrar implements DidRegistrar {
  public static readonly method = 'hedera'

  public readonly supportsController = true

  public createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult> {
    return tenantAgent.dids.create<HederaDidCreateOptions>({
      method: DidHederaRegistrar.method,
      // Credo takes the controller from the DID document; the DID's own id is assigned on creation
      // (see `HekaHederaLedgerService`)
      didDocument: options.controller ? new DidDocument({ id: '', controller: [options.controller] }) : undefined,
    })
  }
}
