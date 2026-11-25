/**
 * SD-JWT VC payload of the contributor credential. The claims in `CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS`
 * are selectively disclosable; `verifiedAt` is always disclosed. `vct` comes from the credential configuration.
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

  /** Unix expiry. Credo sets `iat` when it signs. */
  exp: number

  /** Index signature required by the generic offer's `CredentialPayload`. */
  [key: string]: unknown
}

/** The issuer organization's setup, as the generic offer needs it. */
export interface ContributorIssuer {
  /** `Organization_<CONTRIBUTOR_ISSUER_ORG_ID>`. */
  walletId: string
  tenantId: string
  /** `CONTRIBUTOR_ISSUER_DID`, which signs the credential. */
  did: string
  /** The credential configuration of the "GitHub Contributor" schema's `vc+sd-jwt` registration on that DID. */
  supportedCredentialId: string
  publicIssuerId: string
}
