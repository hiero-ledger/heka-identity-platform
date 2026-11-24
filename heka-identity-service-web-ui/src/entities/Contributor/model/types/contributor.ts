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
  linkedAt?: string;
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

/** `GET /v2/contributor-onboarding/status` */
export interface ContributorOnboardingStatus {
  github?: ContributorGithubIdentity;
  binding?: ContributorBinding | null;
  verificationStatus: ContributorVerificationStatus;
  auditEvents: ContributorAuditEvent[];
  credentialIssued?: boolean;
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
  binding?: ContributorBinding;
}

/** `POST /v2/contributor-credential/offer` */
export interface ContributorCredentialOffer {
  /** `openid-credential-offer://` URI */
  credentialOffer: string;
  /** Pre-authorized code transaction code, entered in the wallet; it is not part of the offer */
  txCode: string;
  /** ISO date-time after which the offer can no longer be redeemed */
  expiresAt: string;
}

/** Onboarding wizard step, 0-indexed: link GitHub, request a challenge, sign it, receive the credential */
export type OnboardingStep = 0 | 1 | 2 | 3;

export interface ContributorSchema {
  /** Current wizard step */
  currentStep: OnboardingStep;
  /** Steps the user has completed */
  completedSteps: OnboardingStep[];
  /** Whether a GitHub account is linked to this session */
  githubLinked: boolean;
  /** GitHub username returned after OAuth */
  githubUsername: string | null;
  /** GitHub account ID returned after OAuth */
  githubAccountId: string | null;
  /** The active GPG challenge, from step 2 (sign) onwards */
  activeChallenge: ContributorGpgChallenge | null;
  /** The last GPG verification result */
  verificationResult: VerifyContributorGpgChallengeResult | null;
  /** The contributor wallet binding (populated after verification) */
  binding: ContributorBinding | null;
  /** Whether the credential has been issued and received into the wallet */
  credentialIssued: boolean;
  /** Global loading flag for async actions */
  isLoading: boolean;
  /** Error of the most recent failed action, until the next user action */
  error: string | null;
}
