import { DidDocument, DidDocumentService, VerificationMethod } from '@credo-ts/core'
import { SingleOrArray } from '@credo-ts/core/build/utils'

export type IndyBesuService = {
  id: string
  type: string
  serviceEndpoint: SingleOrArray<string | Record<string, unknown>>
}

export type IndyBesuDidDocument = {
  '@context': string[]
  id: string
  controller: string[]
  verificationMethod: VerificationMethod[]
  authentication: IndyBesuVerificationRelationship[]
  assertionMethod: IndyBesuVerificationRelationship[]
  capabilityInvocation: IndyBesuVerificationRelationship[]
  capabilityDelegation: IndyBesuVerificationRelationship[]
  keyAgreement: IndyBesuVerificationRelationship[]
  service: IndyBesuService[]
  alsoKnownAs: string[]
}

export type IndyBesuVerificationMethod = {
  id: string
  type: string
  controller: string
  publicKeyMultibase?: string
  publicKeyBase58?: string
}

export type IndyBesuVerificationRelationship = string | VerificationMethod

export function toIndyBesuDidDocument(didDocument: DidDocument): IndyBesuDidDocument {
  return {
    '@context': ensureArray(didDocument.context),
    id: didDocument.id,
    controller: ensureArray(didDocument.controller ?? []),
    verificationMethod: didDocument.verificationMethod ?? [],
    authentication: didDocument.authentication ?? [],
    assertionMethod: didDocument.assertionMethod ?? [],
    capabilityInvocation: didDocument.capabilityInvocation ?? [],
    capabilityDelegation: didDocument.capabilityDelegation ?? [],
    keyAgreement: didDocument.keyAgreement ?? [],
    service: didDocument.service ?? [],
    alsoKnownAs: didDocument.alsoKnownAs ?? [],
  }
}

export function fromIndyBesuDidDocument(didDocument: IndyBesuDidDocument): DidDocument {
  const context = didDocument['@context'].length === 1 ? didDocument['@context'][0] : didDocument['@context']
  return new DidDocument({
    context,
    id: didDocument.id,
    alsoKnownAs: didDocument.alsoKnownAs.length > 0 ? didDocument.alsoKnownAs : undefined,
    controller: didDocument.controller.length > 0 ? didDocument.controller : undefined,
    verificationMethod: mapOrUndefined(didDocument.verificationMethod, fromIndyBesuVerificationMethod),
    service: mapOrUndefined(didDocument.service, fromIndyBesuService),
    authentication: mapOrUndefined(didDocument.authentication, fromIndyBesuVerificationRelationship),
    assertionMethod: mapOrUndefined(didDocument.assertionMethod, fromIndyBesuVerificationRelationship),
    keyAgreement: mapOrUndefined(didDocument.keyAgreement, fromIndyBesuVerificationRelationship),
    capabilityInvocation: mapOrUndefined(didDocument.capabilityInvocation, fromIndyBesuVerificationRelationship),
    capabilityDelegation: mapOrUndefined(didDocument.capabilityDelegation, fromIndyBesuVerificationRelationship),
  })
}

function ensureArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

function mapOrUndefined<T, R>(array: T[], mapfunction: (item: T) => R): R[] | undefined {
  if (!array) {
    return undefined
  }
  return array.length > 0 ? array.map(mapfunction) : undefined
}

function fromIndyBesuVerificationMethod(verificationMethod: IndyBesuVerificationMethod): VerificationMethod {
  return new VerificationMethod({
    id: verificationMethod.id,
    type: verificationMethod.type,
    controller: verificationMethod.controller,
    publicKeyBase58: verificationMethod.publicKeyBase58,
  })
}

function fromIndyBesuService(service: IndyBesuService): DidDocumentService {
  return new DidDocumentService({ id: service.id, serviceEndpoint: service.serviceEndpoint, type: service.type })
}

function fromIndyBesuVerificationRelationship(
  verificationRelationship: IndyBesuVerificationRelationship
): string | VerificationMethod {
  if (typeof verificationRelationship === 'string') {
    return verificationRelationship
  } else {
    return fromIndyBesuVerificationMethod(verificationRelationship)
  }
}
