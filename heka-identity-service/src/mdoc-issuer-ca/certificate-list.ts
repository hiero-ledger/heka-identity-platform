import { X509Certificate } from '@credo-ts/core'

/**
 * Parsing helpers for **certificate-list config values** (`EU_TRUSTED_ISSUER_CERTIFICATES`,
 * `EU_LOTL_SIGNER_CERTIFICATES`): either PEM `-----BEGIN CERTIFICATE-----` blocks or
 * comma/whitespace-separated base64 DER. Empty config → empty list. One tokenizer feeds both output
 * forms — parsed `X509Certificate`s (trust-anchor use) and normalized base64 DER strings
 * (byte-comparison use).
 */

/** Split a config value into per-certificate tokens (PEM blocks, or comma/whitespace-separated base64). */
function tokenizeCertificateList(raw: string): string[] {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return []
  const pemBlocks = trimmed.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
  return pemBlocks ?? trimmed.split(/[\s,]+/).filter(Boolean)
}

/** Strip PEM armor + all whitespace → canonical base64 DER, for byte-pinned comparison. */
export function normalizeBase64Certificate(input: string): string {
  return input.replace(/-----(?:BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '')
}

/**
 * Parse a signer-cert-list config value into normalized base64 DER strings — the byte-comparison form
 * `verifyTrustedListSignature` pins Trusted-List signers against.
 */
export function parseSignerCertificates(raw: string): string[] {
  return tokenizeCertificateList(raw).map(normalizeBase64Certificate).filter(Boolean)
}

/** Parse a curated-anchor-list config value into `X509Certificate`s. */
export function parseConfiguredAnchors(raw: string): X509Certificate[] {
  return tokenizeCertificateList(raw).map((token) => X509Certificate.fromEncodedCertificate(token.trim()))
}

/** De-duplicate certificates by base64 DER (two sources/lists may carry the same cross-border CA). */
export function dedupeCertificates(certificates: X509Certificate[]): X509Certificate[] {
  const seen = new Set<string>()
  const unique: X509Certificate[] = []
  for (const certificate of certificates) {
    const der = certificate.toString('base64')
    if (seen.has(der)) continue
    seen.add(der)
    unique.push(certificate)
  }
  return unique
}
