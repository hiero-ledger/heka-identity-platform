/**
 * Exact shape of the SD-JWT VC payload for a GithubContributorCredential.
 *
 * Claims are split into two groups based on the Week 2 disclosure policy:
 *
 * Always-present (non-selectively-disclosable):
 *   - `githubAccountId` — GitHub's immutable numeric account ID (string form)
 *   - `verifiedAt`      — ISO-8601 timestamp of the successful GPG verification
 *   - `walletId`        — Heka wallet ID derived from the account ID
 *
 * Selectively disclosable (listed in CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS):
 *   - `githubUsername`  — GitHub login at the time of verification
 *   - `gpgFingerprint`  — Uppercase hex fingerprint of the verified GPG key
 */
export interface ContributorCredentialPayload {
  /** GitHub numeric account ID (immutable — identity binding anchor). */
  githubAccountId: string

  /** GitHub login / username at the time of verification. */
  githubUsername: string

  /**
   * Full fingerprint of the GPG key that produced the verified signature,
   * formatted as an uppercase hex string (e.g. "A1B2C3D4E5F6…").
   */
  gpgFingerprint: string

  /** ISO-8601 UTC timestamp at which GPG ownership was verified. */
  verifiedAt: string

  /** Heka wallet ID linked to this contributor's GitHub account ID. */
  walletId: string

  /** Verifiable Credential Type (required by SD-JWT VC format) */
  vct: string

  /** Allows any other claims, required for compatibility with SdJwtVcPayload */
  [key: string]: unknown
}
