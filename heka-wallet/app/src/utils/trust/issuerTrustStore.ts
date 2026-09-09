/**
 * In-memory store of mdoc **issuer** trust anchors (issuer CA certificates, base64 DER) learned from
 * signed trust lists. Two independent sources populate their own slot:
 *   - `'vical'` — the Heka VICAL (per-tenant IACAs), via {@link refreshIssuerTrustList}.
 *   - `'eu'`    — the Heka EU trust list (curated external EU issuer CAs), via `refreshEuTrustList`.
 *
 * The X509Module's `getTrustedCertificatesForVerification` reads the union at credential (MSO)
 * verification time, so this must be a mutable singleton the agent config can close over while the
 * populators run asynchronously after startup. Source-keyed so the two never clobber each other.
 *
 * This is the mdoc *issuer* trust domain — distinct from the verifier request-signer trust set.
 */
export type IssuerTrustSource = 'vical' | 'eu'

const learnedBySource: Record<IssuerTrustSource, string[]> = { vical: [], eu: [] }

export const issuerTrustStore = {
  /** Replace the learned certificates for one source (called after that list is fetched + verified). */
  setIssuerCertificates(source: IssuerTrustSource, certificates: string[]): void {
    learnedBySource[source] = [...certificates]
  },
  /** The union of currently-trusted issuer certificates (base64 DER) across all sources. */
  getIssuerCertificates(): string[] {
    return [...learnedBySource.vical, ...learnedBySource.eu]
  },
  clear(): void {
    learnedBySource.vical = []
    learnedBySource.eu = []
  },
}
