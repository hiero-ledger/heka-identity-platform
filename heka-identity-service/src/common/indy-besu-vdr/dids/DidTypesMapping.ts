import { DidDocument, DidDocumentService, JsonTransformer, VerificationMethod } from '@credo-ts/core'

import {
  DidDocument as IndyBesuDidDocument,
  Service as IndyBesuService,
  VerificationMethod as IndyBesuVerificationMethod,
  VerificationRelationship as IndyBesuVerificationRelationship,
} from '../ledger'

type DidDocumentJson = {
  '@context'?: string | string[]
  id: string
  controller?: string | string[]
  verificationMethod?: IndyBesuVerificationMethod[]
  authentication?: IndyBesuVerificationRelationship[]
  assertionMethod?: IndyBesuVerificationRelationship[]
  capabilityInvocation?: IndyBesuVerificationRelationship[]
  capabilityDelegation?: IndyBesuVerificationRelationship[]
  keyAgreement?: IndyBesuVerificationRelationship[]
  service?: IndyBesuService[]
  alsoKnownAs?: string[]
}

export function toIndyBesuDidDocument(didDocument: DidDocument): IndyBesuDidDocument {
  // The VDR takes plain JSON: Credo class instances and `undefined` properties (e.g. a second key-material property of
  // a verification method) are rejected by its document validation
  const json = withoutUndefined(JsonTransformer.toJSON(didDocument)) as DidDocumentJson
  return {
    '@context': ensureArray(json['@context'] ?? []),
    id: json.id,
    controller: ensureArray(json.controller ?? []),
    verificationMethod: json.verificationMethod ?? [],
    authentication: json.authentication ?? [],
    assertionMethod: json.assertionMethod ?? [],
    capabilityInvocation: json.capabilityInvocation ?? [],
    capabilityDelegation: json.capabilityDelegation ?? [],
    keyAgreement: json.keyAgreement ?? [],
    service: json.service ?? [],
    alsoKnownAs: json.alsoKnownAs ?? [],
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

function withoutUndefined(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
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
    publicKeyMultibase: verificationMethod.publicKeyMultibase,
  })
}

function fromIndyBesuService(service: IndyBesuService): DidDocumentService {
  return new DidDocumentService({ id: service.id, serviceEndpoint: service.serviceEndpoint, type: service.type })
}

function fromIndyBesuVerificationRelationship(
  verificationRelationship: IndyBesuVerificationRelationship,
): string | VerificationMethod {
  if (typeof verificationRelationship === 'string') {
    return verificationRelationship
  } else {
    return fromIndyBesuVerificationMethod(verificationRelationship)
  }
}
