/** A verification method of a DID document (W3C DID Core). Unknown properties are kept. */
export interface DidVerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyBase58?: string;
  publicKeyBase64?: string;
  publicKeyJwk?: Record<string, unknown>;
  publicKeyHex?: string;
  publicKeyMultibase?: string;
  publicKeyPem?: string;
  blockchainAccountId?: string;
  ethereumAddress?: string;
  [key: string]: unknown;
}

/** A service of a DID document. DIDComm services carry extras such as `recipientKeys`. */
export interface DidService {
  id: string;
  type: string;
  serviceEndpoint: unknown;
  [key: string]: unknown;
}

/** A verification relationship entry: a reference to a verification method, or an embedded one. */
export type DidVerificationRelationshipEntry = string | DidVerificationMethod;

/** A DID document as the identity service stores it (`GET /dids?own=true`). */
export interface DidDocument {
  '@context'?: string | string[];
  id: string;
  alsoKnownAs?: string[];
  controller?: string | string[];
  verificationMethod?: DidVerificationMethod[];
  service?: DidService[];
  authentication?: DidVerificationRelationshipEntry[];
  assertionMethod?: DidVerificationRelationshipEntry[];
  keyAgreement?: DidVerificationRelationshipEntry[];
  capabilityInvocation?: DidVerificationRelationshipEntry[];
  capabilityDelegation?: DidVerificationRelationshipEntry[];
  [key: string]: unknown;
}

/** A DID method whose DIDs could not be loaded, with the server's message. */
export interface DidMethodError {
  method: string;
  message: string;
}

export interface GetDidsResult {
  items: DidDocument[];
  failedMethods: DidMethodError[];
}

export interface DidsSchema {
  isLoading: boolean;
  /** The whole list could not be loaded */
  error?: string;
  /** The wallet's own DIDs of the configured methods; undefined until loaded */
  items?: DidDocument[];
  /** Methods whose DIDs could not be loaded; the DIDs of the other methods are in `items` */
  failedMethods?: DidMethodError[];
  /** The latest list request: responses of older ones are ignored */
  listRequestId?: string;
}
