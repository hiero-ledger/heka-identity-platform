/**
 * Stable identifier for the GithubContributorCredential entry inside
 * the OID4VCI issuer's `credential_configurations_supported` map.
 *
 * This value is used as the `credentialSupportedId` when creating an offer
 * and must stay consistent between issuer registration and offer creation.
 */
export const CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID = 'GithubContributorCredentialSdJwt' as const

/**
 * Verifiable Credential Type (vct) URI that uniquely identifies this
 * credential profile in the SD-JWT VC payload.
 *
 * Consumers of the credential (wallets, verifiers) use this URI to look up
 * the credential's schema and display metadata.
 */
export const CONTRIBUTOR_CREDENTIAL_VCT = 'https://hiero.ledger.org/vct/GithubContributorCredential' as const

/**
 * Claims placed inside the SD-JWT selective-disclosure (`_sd`) hash group,
 * allowing the holder to reveal them individually.
 *
 * Disclosure policy (docs/contributor-onboarding.md):
 *   - `githubAccountId` — the immutable GitHub account; disclosed when a verifier
 *     matches the holder to a GitHub account (e.g. a pull request author)
 *   - `githubUsername`  — the login at verification time; it can change
 *   - `gpgFingerprint`  — the verified key, for commit-signature checks
 *
 * Always present: `verifiedAt` (time of the GPG proof). No claim identifies
 * the Heka user or wallet; holder binding is the `cnf` key.
 */
export const CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS = ['githubAccountId', 'githubUsername', 'gpgFingerprint'] as const

/**
 * How long a GithubContributorCredential stays valid.
 * This prototype does not publish a status list, so `exp` is the freshness bound
 * after a GitHub unlink, a GPG key change, or a policy change.
 */
export const CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS = 90 * 24 * 60 * 60

/** Digits the holder must enter before the pre-authorized offer can be redeemed. */
export const CONTRIBUTOR_CREDENTIAL_TX_CODE_LENGTH = 8

/**
 * How long a credential offer can be redeemed. Credo's default is 180 seconds,
 * which expires while the holder is still reading the transaction code.
 */
export const CONTRIBUTOR_CREDENTIAL_OFFER_TTL_SECONDS = 10 * 60

/** Human-readable display label shown in wallets and verifier UIs. */
export const CONTRIBUTOR_CREDENTIAL_DISPLAY_NAME = 'GitHub Contributor Credential' as const
