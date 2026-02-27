import type { DidCreateResult } from '@credo-ts/core'

import { TenantAgent } from '../agent'

export enum KeyType {
  Ed25519VerificationKey2020 = 'Ed25519VerificationKey2020',
}

export interface CreateDidOptions {
  namespace?: string
  controller?: string
  publicKeyId?: string
  publicKey?: string
  publicKeyType?: KeyType
}

export abstract class DidRegistrar {
  public static readonly method: string

  public abstract createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult>
}
