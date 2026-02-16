import { SingleOrArray } from '@credo-ts/core'

export type Service = {
  id: string
  type: string
  serviceEndpoint: SingleOrArray<string | Record<string, unknown>>
}

export type DidDocument = {
  '@context': string[]
  id: string
  controller: string[]
  verificationMethod: VerificationMethod[]
  authentication: VerificationRelationship[]
  assertionMethod: VerificationRelationship[]
  capabilityInvocation: VerificationRelationship[]
  capabilityDelegation: VerificationRelationship[]
  keyAgreement: VerificationRelationship[]
  service: Service[]
  alsoKnownAs: string[]
}

export type VerificationMethod = {
  id: string
  type: string
  controller: string
  publicKeyMultibase?: string
  publicKeyBase58?: string
}

export type VerificationRelationship = string | VerificationMethod
