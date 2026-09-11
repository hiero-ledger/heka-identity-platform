/**
 * The wallet's **static** trust anchors — configuration-supplied certificate sets that always apply
 * next to the anchors learned from the trust sources. Nothing is bundled in code: a build trusts only
 * what its `react-native-config` says, and both sets are empty by default. Values are parsed once at
 * startup; an invalid entry throws (same policy as `TRUST_SOURCES`).
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
 * PEM block (armour and whitespace are stripped); duplicates dropped. Throws a descriptive error
 * naming the variable and the offending entry.
 */
export function parseCertificateList(raw: string | undefined, name: string): string[] {
  if (!raw || raw.trim() === '') return []
  const certificates: string[] = []
  raw.split(',').forEach((entry, index) => {
    const certificate = entry.replace(PEM_ARMOUR, '').replace(/\s+/g, '')
    if (certificate === '') return
    if (!BASE64.test(certificate)) {
      throw new Error(`${name}[${index}] is not a base64 DER (or PEM) certificate`)
    }
    if (!certificates.includes(certificate)) certificates.push(certificate)
  })
  return certificates
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
