export interface VerificationMethod {
  id: string;
}

export interface DidDocument {
  id: string;
  verificationMethod: Array<VerificationMethod>;
}

/** Access token of the OIDC session, mirrored from the OIDC client; refresh tokens stay in the client. */
export interface Tokens {
  accessToken: string | null;
}

export interface User {
  name?: string | null;
  tokens?: Tokens;
  did?: string | null;
  didMethods?: Array<string>;
  messageDeliveryType?: string | null;
  webHook?: string | null;
  issuerName?: string | null;
  backgroundColor?: string | null;
  logo?: string | null;
  registeredAt?: string | null;
}

export interface UserSchema {
  isLoading: boolean;
  isPreparing: boolean;
  data?: User;
  error?: string;
  /**
   * `prepare-wallet` has run with no DID left `failed`: Home stops calling it. Kept in the store
   * only, so a reload, sign-out or session drop prepares again.
   */
  isWalletPrepared: boolean;
}

/** The agency profile, `GET /user` (and the `PATCH /user` response) */
export interface GetAgencyUserResult {
  messageDeliveryType?: string;
  webHook?: string;
  name?: string;
  backgroundColor?: string;
  logo?: string;
  registeredAt?: string;
}

export interface GetDidDocumentsParams {
  /** DID method; all own DIDs when omitted */
  method?: string;
}
