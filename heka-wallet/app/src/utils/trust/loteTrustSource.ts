import { X509Certificate } from '@credo-ts/core'

import { trustAnchorStore } from './trustAnchorStore'
import { TrustRole, TrustSourceConfig } from './trustSources'

/**
 * Generic loader for one configured trust source: an **ETSI TS 119 602 LoTE JWT** (compact JWS,
 * `typ: trustlist+jwt`, signer chain in `x5c`). Fetch → verify (chain pinned to the source's signer
 * certificates, ES256 over the JWS signing input) → extract the anchors of the source's role →
 * optionally follow the list's in-spec pointers one level → replace the source's slice of the store.
 * Best-effort and total: never throws; a failed source keeps its previously-trusted slice.
 */

/**
 * Minimal structural view of the agent APIs a refresh needs — keeps the trust modules decoupled from
 * the concrete agent type (and easy to unit-test). The real `HekaWalletAgent` satisfies it.
 */
export interface TrustVerifyAgent {
  x509: {
    validateCertificateChain(options: { certificateChain: string[]; trustedCertificates?: string[] }): Promise<unknown>
  }
  kms: {
    verify(options: {
      key: { publicJwk: unknown }
      algorithm: 'ES256'
      data: Uint8Array
      signature: Uint8Array
    }): Promise<{ verified: boolean }>
  }
}

export interface TrustRefreshOptions {
  /** Override for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

export interface PointerRefreshResult {
  location: string
  ok: boolean
  reason?: string
  anchorCount?: number
}

export interface TrustSourceRefreshResult {
  sourceId: string
  ok: boolean
  reason?: string
  /** Anchors now trusted from this source (own list + followed pointers). */
  anchorCount?: number
  /** Per-pointer outcomes when `followPointers` is on. A failed pointer never fails the source. */
  pointers?: PointerRefreshResult[]
}

/** JWS `typ` a TS 119 602 LoTE JWT is published under (`@owf/eudi-lote`'s `signLoTE`). */
const LOTE_JWT_TYP = 'trustlist+jwt'

const SVC_TYPE_PREFIX = 'http://uri.etsi.org/19602/SvcType/'

/**
 * TS 119 602 service types per role. A source only ever yields the anchors of its own role, so a
 * list carrying both issuer and access-certificate services never cross-contaminates. Untyped
 * services (generic lists) are accepted for either role — the source config decides.
 */
const SERVICE_TYPES_BY_ROLE: Record<TrustRole, ReadonlySet<string>> = {
  'credential-issuer': new Set([
    `${SVC_TYPE_PREFIX}EAA/Issuance`,
    `${SVC_TYPE_PREFIX}PID/Issuance`,
    `${SVC_TYPE_PREFIX}PubEAA/Issuance`,
  ]),
  'access-certificate': new Set([`${SVC_TYPE_PREFIX}WRPAC/Issuance`]),
}

/** Minimal structural view of a LoTE payload — the fields the anchor / pointer extraction walks. */
interface LotePayload {
  LoTE?: {
    ListAndSchemeInformation?: {
      PointersToOtherLoTE?: Array<{
        LoTELocation?: unknown
        ServiceDigitalIdentities?: Array<{ X509Certificates?: Array<{ val?: unknown }> }>
      }>
    }
    TrustedEntitiesList?: Array<{
      TrustedEntityServices?: Array<{
        ServiceInformation?: {
          ServiceTypeIdentifier?: string
          ServiceStatus?: string
          ServiceDigitalIdentity?: { X509Certificates?: Array<{ val?: unknown }> }
        }
      }>
    }>
  }
}

interface LotePointer {
  location: string
  pinnedSigners: string[]
}

interface VerifiedLote {
  anchors: string[]
  pointers: LotePointer[]
}

type LoadOutcome = { ok: true; lote: VerifiedLote } | { ok: false; reason: string }

// base64url → bytes / string via Buffer (present in RN via the Credo/askar stack).
function base64UrlToBytes(input: string): Uint8Array {
  return Uint8Array.from(Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
}
function base64UrlToString(input: string): string {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

/**
 * A service is active when it carries no `ServiceStatus` (the EU LoTE profiles omit it — "listed is
 * granted") or when its status URI ends in `granted` (mirrors the identity-service rule).
 */
const isActive = (status: string | undefined): boolean =>
  status === undefined || status.trim() === '' ? true : status.trim().toLowerCase().endsWith('granted')

const isServiceOfRole = (serviceType: string | undefined, role: TrustRole): boolean =>
  serviceType === undefined || SERVICE_TYPES_BY_ROLE[role].has(serviceType)

function certificateValues(certificates: Array<{ val?: unknown }> | undefined): string[] {
  const values: string[] = []
  for (const certificate of certificates ?? []) {
    if (typeof certificate.val === 'string' && certificate.val.trim()) values.push(certificate.val.replace(/\s+/g, ''))
  }
  return values
}

/**
 * The active anchors of `role`: `LoTE.TrustedEntitiesList[] → TrustedEntityServices[] →
 * ServiceInformation → ServiceDigitalIdentity.X509Certificates[].val`. Structural walk only — the
 * list's publisher schema-validates it, and the surrounding frame verifies its signature.
 */
function extractAnchors(payload: LotePayload, role: TrustRole): string[] {
  const anchors: string[] = []
  for (const entity of payload.LoTE?.TrustedEntitiesList ?? []) {
    for (const entityService of entity.TrustedEntityServices ?? []) {
      const info = entityService.ServiceInformation
      if (!info || !isActive(info.ServiceStatus) || !isServiceOfRole(info.ServiceTypeIdentifier, role)) continue
      anchors.push(...certificateValues(info.ServiceDigitalIdentity?.X509Certificates))
    }
  }
  return [...new Set(anchors)]
}

/** In-spec pointers (`ListAndSchemeInformation.PointersToOtherLoTE`) with the signer certs they pin. */
function extractPointers(payload: LotePayload): LotePointer[] {
  const pointers: LotePointer[] = []
  for (const pointer of payload.LoTE?.ListAndSchemeInformation?.PointersToOtherLoTE ?? []) {
    if (typeof pointer.LoTELocation !== 'string' || !/^https?:\/\//i.test(pointer.LoTELocation)) continue
    const pinnedSigners = (pointer.ServiceDigitalIdentities ?? []).flatMap((identity) =>
      certificateValues(identity.X509Certificates)
    )
    pointers.push({ location: pointer.LoTELocation, pinnedSigners: [...new Set(pinnedSigners)] })
  }
  return pointers
}

/** Fetch one LoTE JWT, verify it against `pinnedSigners`, and extract the anchors of `role`. */
async function loadSignedLote(
  agent: TrustVerifyAgent,
  url: string,
  pinnedSigners: string[],
  role: TrustRole,
  doFetch: typeof fetch
): Promise<LoadOutcome> {
  try {
    const response = await doFetch(url)
    if (!response.ok) return { ok: false, reason: `http-${response.status}` }

    const jws = (await response.text()).trim()
    const parts = jws.split('.')
    if (parts.length !== 3) return { ok: false, reason: 'malformed-jws' }
    const [headerB64, payloadB64, signatureB64] = parts

    const header = JSON.parse(base64UrlToString(headerB64)) as { typ?: string; x5c?: unknown }
    if (header.typ !== LOTE_JWT_TYP) return { ok: false, reason: 'unexpected-typ' }
    const x5c = header.x5c
    if (!Array.isArray(x5c) || x5c.length === 0 || !x5c.every((c) => typeof c === 'string')) {
      return { ok: false, reason: 'no-x5c' }
    }
    const certificateChain = x5c as string[]

    // 1) The list signer must chain to one of the source's pinned certificates.
    await agent.x509.validateCertificateChain({ certificateChain, trustedCertificates: pinnedSigners })

    // 2) The list signature must verify with the signer leaf key over the JWS signing input.
    const signerLeaf = X509Certificate.fromEncodedCertificate(certificateChain[0])
    const { verified } = await agent.kms.verify({
      key: { publicJwk: signerLeaf.publicJwk.toJson() },
      algorithm: 'ES256',
      data: Uint8Array.from(Buffer.from(`${headerB64}.${payloadB64}`, 'utf8')),
      signature: base64UrlToBytes(signatureB64),
    })
    if (!verified) return { ok: false, reason: 'invalid-signature' }

    // 3) Only now is the (verified) content trusted.
    const payload = JSON.parse(base64UrlToString(payloadB64)) as LotePayload
    return { ok: true, lote: { anchors: extractAnchors(payload, role), pointers: extractPointers(payload) } }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown-error' }
  }
}

/**
 * Refresh one source: verify its list, optionally follow its in-spec pointers one level (each pinned
 * to the pointer's own signer certificates; a pointer's pointers are never followed), and replace the
 * source's slice of the trust anchor store. Never throws; on failure the previous slice is kept.
 */
export async function refreshTrustSource(
  agent: TrustVerifyAgent,
  source: TrustSourceConfig,
  options: TrustRefreshOptions = {}
): Promise<TrustSourceRefreshResult> {
  const { id: sourceId, role } = source
  const doFetch = options.fetchImpl ?? fetch

  if (!source.url) return { sourceId, ok: false, reason: 'no-url' }
  if (source.pinnedSigners.length === 0) return { sourceId, ok: false, reason: 'no-pinned-signers' }

  const primary = await loadSignedLote(agent, source.url, source.pinnedSigners, role, doFetch)
  if (!primary.ok) return { sourceId, ok: false, reason: primary.reason }

  const anchors = [...primary.lote.anchors]
  let pointers: PointerRefreshResult[] | undefined
  if (source.followPointers) {
    pointers = []
    for (const pointer of primary.lote.pointers) {
      if (pointer.pinnedSigners.length === 0) {
        pointers.push({ location: pointer.location, ok: false, reason: 'no-pinned-signers' })
        continue
      }
      const followed = await loadSignedLote(agent, pointer.location, pointer.pinnedSigners, role, doFetch)
      if (followed.ok) {
        anchors.push(...followed.lote.anchors)
        pointers.push({ location: pointer.location, ok: true, anchorCount: followed.lote.anchors.length })
      } else {
        pointers.push({ location: pointer.location, ok: false, reason: followed.reason })
      }
    }
  }

  const unique = [...new Set(anchors)]
  trustAnchorStore.set(sourceId, unique)
  return { sourceId, ok: true, anchorCount: unique.length, ...(pointers ? { pointers } : {}) }
}

/** Refresh every configured source concurrently; each source degrades independently. */
export function refreshTrustSources(
  agent: TrustVerifyAgent,
  sources: TrustSourceConfig[],
  options: TrustRefreshOptions = {}
): Promise<TrustSourceRefreshResult[]> {
  return Promise.all(sources.map((source) => refreshTrustSource(agent, source, options)))
}
