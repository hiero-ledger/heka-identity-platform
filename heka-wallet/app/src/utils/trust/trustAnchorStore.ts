/**
 * In-memory store of trust anchors (certificates, base64 DER) learned from signed trust lists, one
 * slice per configured source id. The X509Module's `getTrustedCertificatesForVerification` reads it
 * at verification time (through `resolveTrustAnchors`), so this is a mutable singleton the agent
 * config closes over while the sources refresh asynchronously after startup. Slices are independent:
 * a failed refresh of one source never touches another's anchors.
 */
const anchorsBySource = new Map<string, string[]>()

export const trustAnchorStore = {
  /** Replace one source's anchors (called after that list is fetched + verified). */
  set(sourceId: string, anchors: string[]): void {
    anchorsBySource.set(sourceId, [...new Set(anchors)])
  },
  /** The anchors currently learned from one source (empty until its first successful refresh). */
  get(sourceId: string): string[] {
    return [...(anchorsBySource.get(sourceId) ?? [])]
  },
  has(sourceId: string): boolean {
    return anchorsBySource.has(sourceId)
  },
  clear(): void {
    anchorsBySource.clear()
  },
}
