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
  gpgFingerprint?: string;
  verifiedAt?: string;
  linkedAt: string;
  updatedAt: string;
}

export interface ContributorAuditEvent {
  id: string;
  eventType:
    | 'ChallengeRequested'
    | 'ProofAccepted'
    | 'ProofRejected'
    | 'BindingUpdated'
    | 'BindingRemoved';
  githubAccountId?: string;
  githubUsername?: string;
  walletId?: string;
  gpgFingerprint?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** `GET /v2/contributor-onboarding/status` */
export interface ContributorOnboardingStatus {
  github?: ContributorGithubIdentity;
  binding?: ContributorBinding;
  verificationStatus: ContributorVerificationStatus;
  auditEvents: ContributorAuditEvent[];
}

/** `POST /v2/contributor-onboarding/github/link/start` */
export interface GithubLinkStartResult {
  authorizationUrl: string;
}

/** `POST /v2/contributor-onboarding/github/link/callback` */
export interface CompleteGithubLinkResult {
  linked: true;
  githubUsername: string;
}

/** `POST /v2/gpg-challenge/request` */
export interface ContributorGpgChallenge {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  githubUsername: string;
  githubAccountId: string;
}

/** `POST /v2/gpg-challenge/verify` */
export interface VerifyContributorGpgChallengeResult {
  verified: boolean;
  message: string;
  gpgFingerprint?: string;
}

/** `POST /v2/contributor-credential/offer` */
export interface ContributorCredentialOffer {
  /** `openid-credential-offer://` URI */
  credentialOffer: string;
  /** Pre-authorized code transaction code, entered in the wallet; it is not part of the offer */
  txCode: string;
  /** ISO date-time after which the offer can no longer be redeemed */
  expiresAt: string;
  /** Identifies the offer to `GET /v2/contributor-credential/offer/:issuanceSessionId` */
  issuanceSessionId: string;
}

/** Credo's `OpenId4VcIssuanceSessionState` */
export type ContributorCredentialOfferSessionState =
  | 'OfferCreated'
  | 'OfferUriRetrieved'
  | 'AuthorizationInitiated'
  | 'AuthorizationGranted'
  | 'AccessTokenRequested'
  | 'AccessTokenCreated'
  | 'CredentialRequestReceived'
  | 'CredentialsPartiallyIssued'
  | 'Completed'
  | 'Error';

/** `GET /v2/contributor-credential/offer/:issuanceSessionId` */
export interface ContributorCredentialOfferState {
  state: ContributorCredentialOfferSessionState;
  expiresAt: string;
}

/** Onboarding wizard step, 0-indexed: link GitHub, request a challenge, sign it, receive the credential */
export type OnboardingStep = 0 | 1 | 2 | 3;

export interface ContributorSchema {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  githubLinked: boolean;
  githubUsername: string | null;
  githubAccountId: string | null;
  /** The active GPG challenge, from step 2 (sign) onwards */
  activeChallenge: ContributorGpgChallenge | null;
  verificationResult: VerifyContributorGpgChallengeResult | null;
  /** The user's binding, as the last status returned it */
  binding: ContributorBinding | null;
  isLoading: boolean;
  /** Error of the most recent failed action, until the next user action */
  error: string | null;
}
