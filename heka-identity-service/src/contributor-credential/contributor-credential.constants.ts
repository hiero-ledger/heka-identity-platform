/**
 * Name of the schema the issuer organization registers for the credential; schema-v2 makes it the SD-JWT VC `vct`.
 * A plain string on purpose: holders and verifiers built on Credo fetch type metadata from an https `vct`, so a URL
 * would send them to that host.
 */
export const CONTRIBUTOR_SCHEMA_NAME = 'GitHub Contributor'

/** The schema's fields: exactly the credential's claims. */
export const CONTRIBUTOR_SCHEMA_FIELDS = ['githubAccountId', 'githubUsername', 'gpgFingerprint', 'verifiedAt'] as const

/**
 * Selectively disclosable claims (policy in docs/contributor-onboarding.md). `verifiedAt` is always
 * disclosed. No claim identifies the Heka user or wallet; holder binding is the `cnf` key.
 */
export const CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS = ['githubAccountId', 'githubUsername', 'gpgFingerprint'] as const

/** Credential lifetime. Unlinking does not revoke a credential: it stays valid until `exp` unless an operator revokes it. */
export const CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS = 90 * 24 * 60 * 60

/** Digits the holder must enter before the pre-authorized offer can be redeemed. */
export const CONTRIBUTOR_CREDENTIAL_TX_CODE_LENGTH = 8

/**
 * How long a credential offer can be redeemed. Credo's default is 180 seconds,
 * which expires while the holder is still reading the transaction code.
 */
export const CONTRIBUTOR_CREDENTIAL_OFFER_TTL_SECONDS = 10 * 60
