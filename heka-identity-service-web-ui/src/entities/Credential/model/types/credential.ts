import { CredentialConfig } from '@/entities/Credential/model/services/getCredentialConfig';
import { Openid4CredentialFormat } from '@/entities/Schema/model/types/schema';

export enum OpenIdIssuanceState {
  OfferCreated = 'OfferCreated',
  OfferUriRetrieved = 'OfferUriRetrieved',
  AccessTokenRequested = 'AccessTokenRequested',
  AccessTokenCreated = 'AccessTokenCreated',
  CredentialRequestReceived = 'CredentialRequestReceived',
  CredentialsPartiallyIssued = 'CredentialsPartiallyIssued',
  Completed = 'Completed',
}

export enum AnoncredsCredentialState {
  ProposalSent = 'proposal-sent',
  ProposalReceived = 'proposal-received',
  OfferSent = 'offer-sent',
  OfferReceived = 'offer-received',
  Declined = 'declined',
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  CredentialIssued = 'credential-issued',
  CredentialReceived = 'credential-received',
  Done = 'done',
  Abandoned = 'abandoned',
}

export interface IssuanceSession {
  id: string;
  offer?: string;
  state: OpenIdIssuanceState | AnoncredsCredentialState;
}

export interface CredentialSchema {
  isLoading: boolean;
  error?: string;
  issuanceSession?: IssuanceSession;
  credentialsConfig?: CredentialConfig;
}

export interface OpenIdCredentialCommon {
  credentialSupportedId: string;
  format: Openid4CredentialFormat;
  issuer: {
    method: string;
    did: string;
  };
}

export interface SdJwtCredential extends OpenIdCredentialCommon {
  payload: Record<string, unknown>;
  disclosureFrame: {
    _sd: Array<string>;
  };
}

export interface JwtJsonCredential extends OpenIdCredentialCommon {
  credentialSubject: Record<string, unknown>;
}

export interface JwtJsonLdCredential extends OpenIdCredentialCommon {
  '@context': Array<string>;
  credentialSubject: Record<string, unknown>;
}

export interface LdpVcCredential extends OpenIdCredentialCommon {
  '@context': Array<string>;
  credentialSubject: Record<string, unknown>;
}

export type OpenIdCredential =
  | SdJwtCredential
  | JwtJsonCredential
  | JwtJsonLdCredential
  | LdpVcCredential;
