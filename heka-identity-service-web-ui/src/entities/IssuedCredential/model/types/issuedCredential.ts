import { ProtocolType } from '@/entities/Schema';
import { AriesCredentialFormat } from '@/entities/Schema/model/types/schema';

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
  /** Name of the Heka (v2) schema the credential was issued from; undefined when it could not be resolved */
  schemaName?: string;
  formats: string[];
  /** ISO date-time of the last update (issuance finished) */
  issuedAt: string;
  issuerDid?: string;
  credentialDefinitionId?: string;
  credentialConfigurationIds?: string[];
  /**
   * From the identity service, for both protocols: AnonCreds credentials with a revocation registry,
   * and OID4VC sessions whose SD-JWT VCs reference a token status list
   */
  revocable: boolean;
  /** Ledger (AnonCreds) or token status list (SD-JWT VC) status; undefined when unknown */
  revoked?: boolean;
}

export interface IssuedCredentialsSchema {
  isLoading: boolean;
  error?: string;
  items?: IssuedCredential[];
  /**
   * Revocations in flight: thunk requestId to the credential key. Keyed by request, so each
   * request clears only its own entry when it settles.
   */
  revokingRequests: Record<string, string>;
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
  /** Absent when the identity service cannot determine it (or is older than this field) */
  format?: AriesCredentialFormat;
}

/** `GET /openid4vc/issuance-session` item: only the fields the list uses */
export interface OpenIdIssuanceSessionResponse {
  id: string;
  createdAt: string;
  updatedAt?: string;
  publicIssuerId?: string;
  state: string;
  /** true for SD-JWT VC sessions with token status list entries; false for other formats */
  revocable: boolean;
  /** Present only when revocable and the status could be read */
  revoked?: boolean;
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
