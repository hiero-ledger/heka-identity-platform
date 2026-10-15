export const CONTRIBUTOR_CREDENTIAL_SUPPORTED_ID = 'GithubContributorCredentialSdJwt' as const

export const CONTRIBUTOR_CREDENTIAL_VCT = 'https://hiero.ledger.org/vct/GithubContributorCredential' as const

/**
 * Claims placed in the SD-JWT `_sd` selective-disclosure group.
 *
 * Disclosure policy (Week 2):
 *   - `githubUsername`  — selectively disclosable (holder may omit when only the account ID matters)
 *   - `gpgFingerprint`  — selectively disclosable (holder controls when to reveal GPG key ownership)
 *
 * Always-present claims: `githubAccountId`, `verifiedAt`, `walletId`.
 */
export const CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS = ['githubUsername', 'gpgFingerprint'] as const

export const CONTRIBUTOR_CREDENTIAL_DISCLOSURE_FRAME = {
  _sd: [...CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS],
} as const

export const CONTRIBUTOR_CREDENTIAL_DISPLAY_NAME = 'GitHub Contributor Credential' as const
