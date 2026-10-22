import type { DidCreateResult, DidDeactivateResult, DidDocument, DidUpdateResult } from '@credo-ts/core'

import { TenantAgent } from '../agent'

export interface CreateDidOptions {
  namespace?: string
  // DID of the controller, set in the DID document of the new DID (only when `supportsController`)
  controller?: string
}

// `keyAgreement` is left out: added keys are Ed25519 signing keys
export const VERIFICATION_PURPOSES = [
  'authentication',
  'assertionMethod',
  'capabilityInvocation',
  'capabilityDelegation',
] as const

export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number]

// All relationships a verification method can be referenced from, `keyAgreement` included
export const VERIFICATION_RELATIONSHIPS = [...VERIFICATION_PURPOSES, 'keyAgreement'] as const

/** `#fragment` of a DID document entry id, whether it is a full DID URL or already relative. */
export function fragmentOf(id: string): string {
  return id.includes('#') ? `#${id.split('#').pop()}` : id
}

/**
 * Changes to a DID document, as add/remove operations. Ids are relative fragments (`#key-1`); each method wrapper
 * expands them as its ledger needs. Keys of added verification methods are generated in the tenant's KMS.
 */
export interface UpdateDidOptions {
  did: string
  // The current document of the DID, freshly resolved from the ledger. The operations were validated against it
  currentDidDocument: DidDocument
  addServices: Array<{ id: string; type: string; serviceEndpoint: string }>
  removeServices: string[]
  addVerificationMethods: Array<{ id: string; purposes: VerificationPurpose[] }>
  removeVerificationMethods: string[]
}

export abstract class DidRegistrar {
  public static readonly method: string

  // Whether the method can set a controller other than the DID itself
  public abstract readonly supportsController: boolean

  // Whether the wallet that created a DID can change (`updateDid`) or retire (`deactivateDid`) it
  public abstract readonly supportsUpdate: boolean
  public abstract readonly supportsDeactivate: boolean

  // The fragment of the key that holds the authority over the DID on its ledger; it is never changed by an update
  public readonly protectedKeyFragment?: string

  public abstract createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult>

  public updateDid?(tenantAgent: TenantAgent, options: UpdateDidOptions): Promise<DidUpdateResult>

  public deactivateDid?(tenantAgent: TenantAgent, did: string): Promise<DidDeactivateResult>
}
