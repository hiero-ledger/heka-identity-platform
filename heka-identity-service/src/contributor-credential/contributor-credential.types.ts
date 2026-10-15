/**
 * Payload of the SD-JWT VC issued for a `GithubContributorCredential`.
 *
 * Always-present claims: `githubAccountId`, `verifiedAt`, `walletId`.
 * Selectively disclosable: `githubUsername`, `gpgFingerprint`.
 */
export interface ContributorCredentialPayload {
  githubAccountId: string
  githubUsername: string
  gpgFingerprint: string
  verifiedAt: string
  walletId: string
  vct: string
  [key: string]: unknown
}
