import { X509Certificate } from '@credo-ts/core'

import { trustAnchorStore } from './trustAnchorStore'
import { TrustSourceCache } from './trustSourceCache'
import { TrustRole, TrustSourceConfig } from './trustSources'

/**
 * Generic loader for one configured trust source: an **ETSI TS 119 602 LoTE JWT** (compact JWS,
 * `typ: trustlist+jwt`, signer chain in `x5c`). Fetch → verify (chain pinned to the source's signer
 * certificates, ES256 over the JWS signing input) → extract the anchors of the source's role →
 * optionally follow the list's in-spec pointers one level → replace the source's slice of the store.
 * Best-effort and total: never throws; a failed source keeps its previously-trusted slice.
 *
 * The signed documents can also be cached on device (`TrustSourceCache`) and re-loaded without the
 * network — through the very same verification — so a fresh JavaScript runtime (the DC API overlay)
 * or the main app right after unlock trusts the last verified lists immediately.
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
  /** When set, every successfully verified list (and followed pointer list) is written to this cache. */
  cache?: TrustSourceCache
  /** Clock override for tests; defaults to `Date.now`. */
  now?: () => number
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
  /** Whether the verified documents were written to the cache (only reported when a cache is configured). */
  cached?: boolean
}

export interface TrustCacheLoadResult {
  sourceId: string
  ok: boolean
  reason?: string
  anchorCount?: number
  /** Epoch ms the cached list was fetched. */
  fetchedAt?: number
  /** Past the list's `NextUpdate`, or older than {@link TRUST_CACHE_STALE_AFTER_MS}: refresh soon. */
  stale?: boolean
}

/** A cached list without a usable `NextUpdate` counts as stale after this long. */
export const TRUST_CACHE_STALE_AFTER_MS = 24 * 60 * 60 * 1000

/** Grace after a fetched list's `NextUpdate` before it is rejected as stale (publisher clock skew, lag). */
export const TRUST_LIST_STALE_GRACE_MS = 5 * 60 * 1000

/**
 * Last accepted `LoTESequenceNumber` per list location in this runtime (seeded from the cache on load).
 * A refresh that fetches a *lower* sequence than this is a replay of an older issue and is rejected: a
 * validly signed old list must not bring a since-delisted issuer back (M1).
 */
const lastAcceptedSequence = new Map<string, number>()

/** Forget the accepted sequence numbers (tests). */
export function resetTrustSequenceMemory(): void {
  lastAcceptedSequence.clear()
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
      NextUpdate?: unknown
      LoTESequenceNumber?: unknown
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
  /** `ListAndSchemeInformation.NextUpdate` as epoch ms, when present and parseable. */
  nextUpdate?: number
  /** `ListAndSchemeInformation.LoTESequenceNumber`, when present. */
  sequenceNumber?: number
}

type LoadOutcome = { ok: true; lote: VerifiedLote; jws: string } | { ok: false; reason: string }

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

/** `ListAndSchemeInformation.NextUpdate` — an ISO 8601 string (or the EU `{ dateTime }` object) → epoch ms. */
function nextUpdateOf(payload: LotePayload): number | undefined {
  const raw = payload.LoTE?.ListAndSchemeInformation?.NextUpdate
  const value = typeof raw === 'string' ? raw : (raw as { dateTime?: unknown } | undefined)?.dateTime
  if (typeof value !== 'string') return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : time
}

/** `ListAndSchemeInformation.LoTESequenceNumber` when it is a non-negative integer. */
function sequenceNumberOf(payload: LotePayload): number | undefined {
  const raw = payload.LoTE?.ListAndSchemeInformation?.LoTESequenceNumber
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : undefined
}

/**
 * Freshness and replay check of a *verified* list from `location` (M1): stale past `NextUpdate` plus grace,
 * or a sequence number below the last accepted one (`baseline`). On acceptance the sequence is remembered.
 */
function acceptFreshList(
  location: string,
  lote: VerifiedLote,
  now: number,
  baseline: number | undefined
): { ok: true } | { ok: false; reason: 'stale-list' | 'sequence-regression' } {
  if (lote.nextUpdate !== undefined && lote.nextUpdate + TRUST_LIST_STALE_GRACE_MS < now) {
    return { ok: false, reason: 'stale-list' }
  }
  if (lote.sequenceNumber !== undefined) {
    const last = Math.max(baseline ?? -1, lastAcceptedSequence.get(location) ?? -1)
    if (last >= 0 && lote.sequenceNumber < last) return { ok: false, reason: 'sequence-regression' }
    lastAcceptedSequence.set(location, lote.sequenceNumber)
  }
  return { ok: true }
}

/**
 * Verify one LoTE JWT (compact JWS) against `pinnedSigners` and extract the anchors of `role`. This is
 * the single trust decision for a list, shared by the network path and the on-device cache: a cached
 * document is trusted only if it passes exactly what a freshly fetched one must pass.
 */
export async function verifySignedLote(
  agent: TrustVerifyAgent,
  jws: string,
  pinnedSigners: string[],
  role: TrustRole
): Promise<LoadOutcome> {
  try {
    const compact = jws.trim()
    const parts = compact.split('.')
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
    return {
      ok: true,
      jws: compact,
      lote: {
        anchors: extractAnchors(payload, role),
        pointers: extractPointers(payload),
        nextUpdate: nextUpdateOf(payload),
        sequenceNumber: sequenceNumberOf(payload),
      },
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown-error' }
  }
}

/** Fetch one LoTE JWT and hand it to {@link verifySignedLote}. */
async function fetchSignedLote(
  agent: TrustVerifyAgent,
  url: string,
  pinnedSigners: string[],
  role: TrustRole,
  doFetch: typeof fetch
): Promise<LoadOutcome> {
  let jws: string
  try {
    const response = await doFetch(url)
    if (!response.ok) return { ok: false, reason: `http-${response.status}` }
    jws = await response.text()
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown-error' }
  }
  return verifySignedLote(agent, jws, pinnedSigners, role)
}

/**
 * Refresh one source: verify its list, optionally follow its in-spec pointers one level (each pinned
 * to the pointer's own signer certificates; a pointer's pointers are never followed), replace the
 * source's slice of the trust anchor store and, when a cache is configured, store the verified
 * documents. Never throws; on failure the previous slice (and cache entry) is kept.
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

  const primary = await fetchSignedLote(agent, source.url, source.pinnedSigners, role, doFetch)
  if (!primary.ok) return { sourceId, ok: false, reason: primary.reason }

  // A validly signed list can still be an old one replayed: reject it (slice and cache stay as they are).
  const now = (options.now ?? Date.now)()
  const cachedSequence = options.cache
    ? (await options.cache.read(sourceId).catch(() => undefined))?.sequenceNumber
    : undefined
  const freshness = acceptFreshList(source.url, primary.lote, now, cachedSequence)
  if (!freshness.ok) return { sourceId, ok: false, reason: freshness.reason }

  const anchors = [...primary.lote.anchors]
  const verifiedPointers: Array<{ location: string; jws: string }> = []
  let pointers: PointerRefreshResult[] | undefined
  if (source.followPointers) {
    pointers = []
    for (const pointer of primary.lote.pointers) {
      if (pointer.pinnedSigners.length === 0) {
        pointers.push({ location: pointer.location, ok: false, reason: 'no-pinned-signers' })
        continue
      }
      const followed = await fetchSignedLote(agent, pointer.location, pointer.pinnedSigners, role, doFetch)
      const accepted = followed.ok ? acceptFreshList(pointer.location, followed.lote, now, undefined) : followed
      if (followed.ok && accepted.ok) {
        anchors.push(...followed.lote.anchors)
        verifiedPointers.push({ location: pointer.location, jws: followed.jws })
        pointers.push({ location: pointer.location, ok: true, anchorCount: followed.lote.anchors.length })
      } else {
        pointers.push({
          location: pointer.location,
          ok: false,
          reason: accepted.ok ? 'unknown-error' : accepted.reason,
        })
      }
    }
  }

  const unique = [...new Set(anchors)]
  trustAnchorStore.set(sourceId, unique)

  let cached: boolean | undefined
  if (options.cache) {
    cached = await options.cache
      .write(sourceId, {
        jws: primary.jws,
        pointers: verifiedPointers,
        fetchedAt: now,
        ...(primary.lote.sequenceNumber !== undefined ? { sequenceNumber: primary.lote.sequenceNumber } : {}),
      })
      .then(
        () => true,
        () => false
      )
  }
  return {
    sourceId,
    ok: true,
    anchorCount: unique.length,
    ...(pointers ? { pointers } : {}),
    ...(cached !== undefined ? { cached } : {}),
  }
}

/** Refresh every configured source concurrently; each source degrades independently. */
export function refreshTrustSources(
  agent: TrustVerifyAgent,
  sources: TrustSourceConfig[],
  options: TrustRefreshOptions = {}
): Promise<TrustSourceRefreshResult[]> {
  return Promise.all(sources.map((source) => refreshTrustSource(agent, source, options)))
}

/**
 * Load one source from the on-device cache — no network. The cached documents go through
 * {@link verifySignedLote} with the source's *configured* pins (a followed pointer list is verified
 * against the pins the verified parent list declares for it, never against anything cached); an entry
 * that fails is evicted. On success the source's slice is replaced and the entry's staleness reported.
 */
export async function loadCachedTrustSource(
  agent: TrustVerifyAgent,
  source: TrustSourceConfig,
  cache: TrustSourceCache,
  now: () => number = Date.now
): Promise<TrustCacheLoadResult> {
  const { id: sourceId, role } = source
  if (source.pinnedSigners.length === 0) return { sourceId, ok: false, reason: 'no-pinned-signers' }

  const entry = await cache.read(sourceId).catch(() => undefined)
  if (!entry) return { sourceId, ok: false, reason: 'no-cache' }

  const primary = await verifySignedLote(agent, entry.jws, source.pinnedSigners, role)
  if (!primary.ok) {
    await cache.evict(sourceId).catch(() => undefined)
    return { sourceId, ok: false, reason: primary.reason }
  }

  const anchors = [...primary.lote.anchors]
  if (source.followPointers) {
    for (const cachedPointer of entry.pointers ?? []) {
      const pointer = primary.lote.pointers.find((candidate) => candidate.location === cachedPointer.location)
      if (!pointer || pointer.pinnedSigners.length === 0) continue
      const followed = await verifySignedLote(agent, cachedPointer.jws, pointer.pinnedSigners, role)
      if (followed.ok) anchors.push(...followed.lote.anchors)
    }
  }

  const unique = [...new Set(anchors)]
  trustAnchorStore.set(sourceId, unique)
  // The cached issue becomes the replay baseline for the next network refresh.
  const knownSequence = Math.max(entry.sequenceNumber ?? -1, primary.lote.sequenceNumber ?? -1)
  if (knownSequence >= 0) {
    lastAcceptedSequence.set(source.url, Math.max(knownSequence, lastAcceptedSequence.get(source.url) ?? -1))
  }

  const current = now()
  const stale =
    (primary.lote.nextUpdate !== undefined && primary.lote.nextUpdate < current) ||
    current - entry.fetchedAt > TRUST_CACHE_STALE_AFTER_MS
  return { sourceId, ok: true, anchorCount: unique.length, fetchedAt: entry.fetchedAt, stale }
}

/** Load every configured source from the cache concurrently; each source degrades independently. */
export function loadCachedTrustSources(
  agent: TrustVerifyAgent,
  sources: TrustSourceConfig[],
  cache: TrustSourceCache,
  now: () => number = Date.now
): Promise<TrustCacheLoadResult[]> {
  return Promise.all(sources.map((source) => loadCachedTrustSource(agent, source, cache, now)))
}
