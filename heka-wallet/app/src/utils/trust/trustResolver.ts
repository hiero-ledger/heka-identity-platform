import { trustAnchorStore } from './trustAnchorStore'
import { TrustClassification, TrustSourceConfig } from './trustSources'
import { CredentialFormat, TrustSubject } from './trustSubject'

/**
 * The sources allowed to vouch for a subject:
 *  - only sources of the subject's role;
 *  - for a credential whose type is **classified** by at least one source, exactly those sources
 *    (a classification is authoritative even while its source has not loaded yet — a network failure
 *    must never widen trust to an unrestricted source);
 *  - otherwise the unrestricted sources (no `classification`).
 */
export function selectTrustSources(sources: TrustSourceConfig[], subject: TrustSubject): TrustSourceConfig[] {
  const ofRole = sources.filter((source) => source.role === subject.role)
  if (subject.role === 'access-certificate-authority') return ofRole

  const { format, credentialType } = subject
  const classified =
    credentialType === undefined
      ? []
      : ofRole.filter((source) => classifies(source.classification, format, credentialType))
  if (classified.length > 0) return classified
  return ofRole.filter((source) => source.classification === undefined)
}

function classifies(
  classification: TrustClassification | undefined,
  format: CredentialFormat,
  credentialType: string
): boolean {
  if (!classification) return false
  if (format === 'mso_mdoc') return classification.docTypes?.includes(credentialType) ?? false
  if (format === 'dc+sd-jwt') return classification.vcts?.includes(credentialType) ?? false
  return false
}

/**
 * Whether some source of the subject's role classifies its type; such a type is trusted through those
 * sources only (see `composeTrustedCertificates`).
 */
export function isClassifiedSubject(sources: TrustSourceConfig[], subject: TrustSubject): boolean {
  if (subject.role !== 'credential-issuer' || subject.credentialType === undefined) return false
  const { format, credentialType } = subject
  return sources.some(
    (source) => source.role === subject.role && classifies(source.classification, format, credentialType)
  )
}

/** The learned anchors (base64 DER, de-duplicated) of the sources selected for `subject`. */
export function resolveTrustAnchors(
  sources: TrustSourceConfig[],
  subject: TrustSubject,
  store: Pick<typeof trustAnchorStore, 'get'> = trustAnchorStore
): string[] {
  return [...new Set(selectTrustSources(sources, subject).flatMap((source) => store.get(source.id)))]
}
