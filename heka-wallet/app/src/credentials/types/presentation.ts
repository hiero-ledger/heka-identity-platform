import { AnonCredsRequestedPredicateMatch } from '@credo-ts/anoncreds'
import { DifPexCredentialsForRequest, DifPresentationExchangeDefinition, ProofExchangeRecord } from '@credo-ts/core'
import { OpenId4VcSiopVerifiedAuthorizationRequest } from '@credo-ts/openid4vc'
import { Attribute } from '@hyperledger/aries-oca/build/legacy'

import { Credential } from './credential'

export enum PresentationSubmissionType {
  OpenId4VP = 'openid4vp-presentation',
  ProofExchange = 'proof-exchange-presentation',
}

export enum ProofExchangeFormatKeys {
  Anoncreds = 'anoncreds',
  Indy = 'indy',
  PresentationExchange = 'presentationExchange',
}

export interface AnoncredsPresentationSubmission extends PresentationSubmission {
  type: PresentationSubmissionType.ProofExchange
  proofExchangeRecord: ProofExchangeRecord
  formatKey: ProofExchangeFormatKeys
  entriesWithAnoncredsMatches: Map<string, AnoncredsSubmissionEntryWithMatches>
  outOfBandGoalCode?: string
}

interface AnoncredsSubmissionEntryWithMatches {
  groupNames: { attributes: string[]; predicates: string[] }
  matches: AnonCredsRequestedPredicateMatch[]
  requestedAttributes: Set<string>
}

export interface OpenIdPresentationSubmission extends PresentationSubmission {
  type: PresentationSubmissionType.OpenId4VP
  submissionParams: {
    credentialsForRequest: DifPexCredentialsForRequest
    authorizationRequest: OpenId4VcSiopVerifiedAuthorizationRequest
  }
}

interface PresentationSubmission {
  name: string
  purpose?: string
  verifierName?: string
  verifierLogoUrl?: string
  areAllSatisfied: boolean
  entries: PresentationSubmissionEntry[]
}

export interface PresentationSubmissionEntry {
  inputDescriptorId: string
  isSatisfied: boolean
  name: string
  description?: string
  selectedOption: CredentialSubmissionOption | null
  submissionOptions: CredentialSubmissionOption[]
}

export interface CredentialSubmissionOption {
  credential: Credential
  requestedAttributes?: Attribute[]
}

export interface OpenId4VcPresentationRequest {
  definition: DifPresentationExchangeDefinition
  credentialsForRequest: DifPexCredentialsForRequest
  authorizationRequest: OpenId4VcSiopVerifiedAuthorizationRequest
  verifierHostName?: string
}
