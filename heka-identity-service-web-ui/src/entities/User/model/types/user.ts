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

export type ContributorVerificationStatus =
  | 'GitHubConnected'
  | 'GpgVerified'
  | 'NotConnected';

export interface ContributorGithubIdentity {
  accountId: string;
  username: string;
}

export interface ContributorBinding {
  githubAccountId: string;
  githubUsername: string;
  walletId: string;
  gpgFingerprint?: string | null;
  verifiedAt?: string | null;
  updatedAt: string;
}

export interface ContributorAuditEvent {
  id: string;
  eventType:
    | 'ChallengeRequested'
    | 'ProofAccepted'
    | 'ProofRejected'
    | 'BindingUpdated';
  githubAccountId?: string;
  githubUsername?: string;
  walletId?: string;
  gpgFingerprint?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ContributorOnboardingStatus {
  github?: ContributorGithubIdentity;
  binding?: ContributorBinding | null;
  verificationStatus: ContributorVerificationStatus;
  auditEvents: ContributorAuditEvent[];
  credentialIssued?: boolean;
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
