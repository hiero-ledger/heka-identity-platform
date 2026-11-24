/** Key of the credential configuration in the issuer's `credential_configurations_supported`; offers name it. */
export const CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID = 'GithubContributorCredentialSdJwt' as const

/**
 * The SD-JWT VC `vct`. A plain string on purpose: holders and verifiers built on Credo fetch type metadata
 * from an https `vct`, so a URL would send them to that host.
 */
export const CONTRIBUTOR_CREDENTIAL_VCT = 'GitHub Contributor' as const

/**
 * Selectively disclosable claims (policy in docs/contributor-onboarding.md). `verifiedAt` is always
 * disclosed. No claim identifies the Heka user or wallet; holder binding is the `cnf` key.
 */
export const CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS = ['githubAccountId', 'githubUsername', 'gpgFingerprint'] as const

/**
 * Credential lifetime. No status list is published, so `exp` is the freshness bound after a GitHub
 * unlink, a GPG key change, or a policy change.
 */
export const CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS = 90 * 24 * 60 * 60

/** Digits the holder must enter before the pre-authorized offer can be redeemed. */
export const CONTRIBUTOR_CREDENTIAL_TX_CODE_LENGTH = 8

/**
 * How long a credential offer can be redeemed. Credo's default is 180 seconds,
 * which expires while the holder is still reading the transaction code.
 */
export const CONTRIBUTOR_CREDENTIAL_OFFER_TTL_SECONDS = 10 * 60

export const CONTRIBUTOR_CREDENTIAL_DISPLAY_NAME = 'GitHub Contributor Credential' as const
