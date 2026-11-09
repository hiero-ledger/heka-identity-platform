import { ProtocolType } from '@/entities/Schema';

/**
 * A finished issuance, DIDComm (AnonCreds) or OpenID4VC, reduced to metadata. Claims, the
 * pre-authorized code and the offer URI never reach the store.
 */
export interface IssuedCredential {
  /** `${protocol}:${id}`: DIDComm record ids and OID4VC session ids may collide */
  key: string;
  /** DIDComm credential exchange record id or OID4VC issuance session id */
  id: string;
  protocol: ProtocolType;
  /** Schema name; falls back to the credential configuration ids or credential definition id */
  name: string;
  formats: string[];
  /** ISO date-time of the last update (issuance finished) */
  issuedAt: string;
  issuerDid?: string;
  credentialDefinitionId?: string;
  credentialConfigurationIds?: string[];
  /** From the identity service, for both protocols: OID4VC sessions are never revocable yet */
  revocable: boolean;
  /** Ledger status; undefined when unknown */
  revoked?: boolean;
}

export interface IssuedCredentialsSchema {
  isLoading: boolean;
  error?: string;
  items?: IssuedCredential[];
  /** Key of the credential whose revocation is in flight */
  revokingKey?: string;
  /** requestId of the latest list request: answers to older ones are ignored */
  listRequestId?: string;
}

/** `GET /credentials` item: only the fields the list uses */
export interface AnoncredsCredentialRecordResponse {
  id: string;
  createdAt: string;
  updatedAt?: string;
  state: string;
  role: string;
  revocable: boolean;
  revoked?: boolean;
  credentialDefinitionId?: string;
}

/** `GET /openid4vc/issuance-session` item: only the fields the list uses */
export interface OpenIdIssuanceSessionResponse {
  id: string;
  createdAt: string;
  updatedAt?: string;
  publicIssuerId?: string;
  state: string;
  revocable: boolean;
  issuanceMetadata?: {
    credentials?: Array<{
      format?: string;
      credentialSupportedId?: string;
      issuer?: { did?: string };
    }>;
  };
  credentialOfferPayload?: {
    credential_configuration_ids?: string[];
  };
}

export interface RevokeIssuedCredentialResult {
  key: string;
  /** The identity service answered 409: the credential was revoked before */
  alreadyRevoked: boolean;
}
