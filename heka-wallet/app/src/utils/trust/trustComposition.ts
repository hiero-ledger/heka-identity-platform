import { StaticAnchors } from './staticAnchors'
import { trustAnchorStore } from './trustAnchorStore'
import { isClassifiedSubject, resolveTrustAnchors } from './trustResolver'
import { TrustSourceConfig } from './trustSources'
import { TrustSubject } from './trustSubject'

/**
 * The trusted certificates for one verification subject: the anchors learned from the sources selected
 * for it (role + classification) plus the static set of its trust domain —
 *  - access-certificate (a signed authorization request / signed issuer metadata): the learned
 *    access-certificate anchors + the service root + the pinned request-signer set;
 *  - a credential whose type (mdoc `docType` / SD-JWT VC `vct`) is **classified** by a configured
 *    source: the classifying sources' anchors **only**. The static sets never apply to a classified
 *    type — otherwise any leaf under the service root (or a static mdoc anchor) could issue, say, the EU
 *    PID `vct` although only the PID providers list may vouch for it;
 *  - an unclassified mdoc: the unrestricted issuer sources + the static mdoc anchors, never the root;
 *  - an unclassified SD-JWT VC: the unrestricted issuer sources + the service root (HAIP x5c leaves);
 *  - any other credential: the unrestricted issuer sources + both static sets.
 */
export function composeTrustedCertificates(
  sources: TrustSourceConfig[],
  subject: TrustSubject,
  staticSets: StaticAnchors,
  store: Pick<typeof trustAnchorStore, 'get'> = trustAnchorStore
): string[] {
  const learned = resolveTrustAnchors(sources, subject, store)
  if (subject.role === 'access-certificate-authority') {
    return unique([...learned, ...staticSets.serviceRoots, ...staticSets.requestSigners])
  }
  if (isClassifiedSubject(sources, subject)) return unique(learned)
  if (subject.format === 'mso_mdoc') return unique([...learned, ...staticSets.mdocIssuers])
  if (subject.format === 'dc+sd-jwt') return unique([...learned, ...staticSets.serviceRoots])
  return unique([...learned, ...staticSets.serviceRoots, ...staticSets.mdocIssuers])
}

const unique = (certificates: string[]): string[] => [...new Set(certificates)]
