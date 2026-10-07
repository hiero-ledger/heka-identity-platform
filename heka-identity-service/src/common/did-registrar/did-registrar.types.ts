import type { DidCreateResult } from '@credo-ts/core'

import { TenantAgent } from '../agent'

export interface CreateDidOptions {
  namespace?: string
  // DID of the controller, set in the DID document of the new DID (only when `supportsController`)
  controller?: string
}

export abstract class DidRegistrar {
  public static readonly method: string

  // Whether the method can set a controller other than the DID itself
  public abstract readonly supportsController: boolean

  public abstract createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult>
}
