import { Attribute } from '@bifold/oca/build/legacy'
import { AnonCredsRequestedPredicateMatch } from '@credo-ts/anoncreds'
import { DcqlQueryResult, DifPexCredentialsForRequest, DifPresentationExchangeDefinition } from '@credo-ts/core'
import { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { OpenId4VpAuthorizationRequestPayload, ParsedTransactionDataEntry } from '@credo-ts/openid4vc'

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
  proofExchangeRecord: DidCommProofExchangeRecord
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
  submissionParams: OpenIdPresentationSubmissionParams
}

export interface OpenIdPresentationSubmissionParams {
  authorizationRequest: OpenId4VpAuthorizationRequestPayload
  credentialsForRequest?: DifPexCredentialsForRequest
  queryResult?: DcqlQueryResult
  origin?: string
  transactionData?: any
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
  /**
   * can be either:
   *  - AnonCreds groupName
   *  - PEX inputDescriptorId
   *  - DCQL credential query id
   */
  inputDescriptorId: string
  name: string
  description?: string
  isSatisfied: boolean
  selectedOption: CredentialSubmissionOption | null
  submissionOptions: CredentialSubmissionOption[]
  /**
   * DIDComm AnonCreds/Indy only: set when no usable credential satisfies the entry, but the wallet holds one that
   * would, except that the ledger shows it as revoked for the requested non-revocation interval.
   */
  revokedCredential?: RevokedCredentialMatch
}

export interface RevokedCredentialMatch {
  credential: Credential
  /** From the issuer's revocation notification, when one was received */
  revocationDate?: Date | string
}

export interface CredentialSubmissionOption {
  credential: Credential
  requestedAttributes?: Attribute[]
}

export interface OpenId4VcPresentationRequest {
  authorizationRequest: OpenId4VpAuthorizationRequestPayload
  definition?: DifPresentationExchangeDefinition
  credentialsForRequest?: DifPexCredentialsForRequest
  queryResult?: DcqlQueryResult
  verifierHostName?: string
  origin?: string
  transactionData?: OpenId4VpTransactionDataEntry[]
}

interface OpenId4VpTransactionDataEntry {
  entry: ParsedTransactionDataEntry
  matchedCredentialIds: string[]
}
