export type X509ClientIdPrefix = 'x509_hash' | 'x509_san_dns'

/**
 * A per-tenant X.509 signer. The KMS key, the X.509 certificate and the
 * (optional) did:jwk all share a single `keyId`, so one private key produces both `x5c` and
 * `did` request signatures. See `x509-context/x509-signing-implementation-plan.md` §4.
 */
export interface X509Signer {
  id: string
  purpose: 'request-signing'
  clientIdPrefix: X509ClientIdPrefix
  /** KMS key id, re-attached to the parsed certificate on load so Credo can sign with it. */
  keyId: string
  /** Base64 DER certificate chain, leaf first. */
  certificateBase64: string
  /** Hex SHA-256 thumbprint of the leaf certificate. */
  fingerprint: string
  /** did:jwk projection of the same key, when provisioned with `alsoCreateDid`. */
  did?: string
  /** Certificate subject/issuer common name, retained so rotation reissues with the same subject. */
  commonName?: string
  /** SAN dNSName, set for x509_san_dns identities. */
  sanDnsName?: string
  /** Default identity for its (purpose, clientIdPrefix) — used when a request omits a certificateId. */
  isDefault: boolean
  createdAt: string
  notAfter: string
}

export interface ProvisionX509SignerOptions {
  /** Defaults to `x509_hash`. */
  clientIdPrefix?: X509ClientIdPrefix
  /** Certificate subject/issuer common name. Defaults to `Heka Verifier Request Signer`. */
  commonName?: string
  /** When set, adds a SAN dNSName extension (required for the x509_san_dns trust model). */
  sanDnsName?: string
  /** Also create a did:jwk bound to the same key. Defaults to `true`. */
  alsoCreateDid?: boolean
  /** Mark as the default for its prefix. Defaults to `true` when no default exists yet. */
  makeDefault?: boolean
  /** Certificate validity in days. Defaults to 365. */
  validityDays?: number
}
