export interface VerificationMethod {
  id: string;
}

export interface DidDocument {
  id: string;
  verificationMethod: Array<VerificationMethod>;
}

export interface Tokens {
  accessToken: string | null;
  refreshToken: string | null;
}

export interface User {
  name?: string | null;
  tokens?: Tokens;
  did?: string | null;
  didMethods?: Array<string>;
  didDocuments?: Array<DidDocument>;
  messageDeliveryType?: string | null;
  webHook?: string | null;
  issuerName?: string | null;
  backgroundColor?: string | null;
  logo?: string | null;
  registeredAt?: string | null;
}

export interface UserSchema {
  isLoading: boolean;
  isRegistered: boolean;
  isPreparing: boolean;
  data?: User;
  error?: string;
}
