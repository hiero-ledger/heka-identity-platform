/**
 * SD-JWT VC payload of the contributor credential. The claims in `CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS`
 * are selectively disclosable; `verifiedAt` is always disclosed.
 */
export interface ContributorCredentialPayload {
  /** GitHub's immutable numeric account id, as a string. */
  githubAccountId: string

  /** GitHub login at verification time; logins can change. */
  githubUsername: string

  /** Uppercase hex fingerprint of the key that made the verified signature. */
  gpgFingerprint: string

  /** ISO-8601 time of the GPG verification. */
  verifiedAt: string

  vct: string

  /** Unix expiry. Credo sets `iat` when it signs; this value is the freshness bound. */
  exp: number

  /** Index signature required by Credo's `SdJwtVcPayload`. */
  [key: string]: unknown
}
