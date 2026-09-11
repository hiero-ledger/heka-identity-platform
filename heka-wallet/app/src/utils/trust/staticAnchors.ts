import { X509Certificate } from '@credo-ts/core'

/**
 * The wallet's **static** trust anchors — configuration-supplied certificate sets that apply next to
 * the anchors learned from the trust sources (for credential types no source classifies, see
 * `composeTrustedCertificates`). Nothing is bundled in code: a build trusts only what its
 * `react-native-config` says, and both sets are empty by default. Values are parsed once at startup and
 * every entry must be a well-formed X.509 certificate; an invalid entry throws (same policy as
 * `TRUST_SOURCES` — `loadTrustConfiguration` turns the throw into a logged startup error).
 */
export interface StaticAnchorEnv {
  /**
   * mdoc **issuer** anchors (IACA / issuer certificates, base64 DER; comma-separated, PEM accepted).
   * Only needed for an issuer that publishes no trust list — tenant issuers are learned from the Heka
   * scheme list. Never ship the identity service's dev `MDL_ISSUER_CERTIFICATE` in a real build.
   */
  TRUSTED_MDOC_ISSUER_CERTIFICATES?: string
  /**
   * OpenID4VP request-signer anchors: the verifier's request-signing **leaf** for the `x509_hash`
   * trust model or its **CA** for `x509_san_dns` (base64 DER; comma-separated, PEM accepted).
   */
  TRUSTED_REQUEST_SIGNER_CERTIFICATES?: string
}

export interface StaticAnchors {
  mdocIssuers: string[]
  requestSigners: string[]
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const PEM_ARMOUR = /-----(?:BEGIN|END) CERTIFICATE-----/g

/**
 * Parse a certificate-list value: entries separated by commas, each a base64 DER certificate or a
 * PEM block (armour and whitespace are stripped) that must decode as an X.509 certificate; duplicates
 * dropped. Throws a descriptive error naming the variable and the offending entry.
 */
export function parseCertificateList(raw: string | undefined, name: string): string[] {
  const certificates: string[] = []
  splitEntries(raw).forEach((entry, index) => {
    const certificate = validateEntry(entry, `${name}[${index}]`)
    if (!certificates.includes(certificate)) certificates.push(certificate)
  })
  return certificates
}

/** Parse a value that must hold exactly one certificate (base64 DER or PEM); errors name `name` alone. */
export function parseCertificate(raw: string | undefined, name: string): string {
  const entries = splitEntries(raw)
  if (entries.length !== 1) throw new Error(`${name} must hold exactly one certificate (found ${entries.length})`)
  return validateEntry(entries[0], name)
}

/** Comma-separated entries with PEM armour and all whitespace removed; blanks dropped. */
function splitEntries(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') return []
  return raw
    .split(',')
    .map((entry) => entry.replace(PEM_ARMOUR, '').replace(/\s+/g, ''))
    .filter((entry) => entry !== '')
}

/** An entry must be base64 and decode as an X.509 certificate — anything else is a misconfiguration, not an anchor. */
function validateEntry(certificate: string, at: string): string {
  if (!BASE64.test(certificate)) throw new Error(`${at} is not a base64 DER (or PEM) certificate`)
  try {
    X509Certificate.fromEncodedCertificate(certificate)
  } catch (error) {
    throw new Error(
      `${at} is not a valid X.509 certificate: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
  return certificate
}

/** The static anchor sets from configuration (both empty when unset). */
export function staticAnchorsFromConfig(env: StaticAnchorEnv): StaticAnchors {
  return {
    mdocIssuers: parseCertificateList(env.TRUSTED_MDOC_ISSUER_CERTIFICATES, 'TRUSTED_MDOC_ISSUER_CERTIFICATES'),
    requestSigners: parseCertificateList(
      env.TRUSTED_REQUEST_SIGNER_CERTIFICATES,
      'TRUSTED_REQUEST_SIGNER_CERTIFICATES'
    ),
  }
}
