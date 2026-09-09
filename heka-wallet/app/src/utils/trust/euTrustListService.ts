import {
  ParseTrustSourceOutcome,
  refreshTrustSource,
  TrustSourceRefreshResult,
  TrustVerifyAgent,
} from './trustSourceRefresh'

/** The agent surface the refresh needs — see {@link TrustVerifyAgent}. */
export type EuTrustListAgent = TrustVerifyAgent

export interface EuRefreshOptions {
  /** URL of the Heka EU trust-list endpoint (`GET /eu-trust-list`). */
  euTrustListUrl?: string
  /** Bundled service root CA cert(s) (base64 DER) the EU-list signer `x5c` must chain to. */
  trustedRootCertificates: string[]
  /** Override for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

export type EuRefreshResult = TrustSourceRefreshResult

/**
 * JWS `typ` the EU trust list is published under: an **ETSI TS 119 602 LoTE JWT** (see the
 * identity-service EuTrustListService / `@owf/eudi-lote`'s `signLoTE`).
 */
const LOTE_JWT_TYP = 'trustlist+jwt'

// base64url → bytes / string via Buffer (present in RN via the Credo/askar stack; same pattern as cbor.ts).
function base64UrlToBytes(input: string): Uint8Array {
  return Uint8Array.from(Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
}
function base64UrlToString(input: string): string {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

/** Minimal structural view of a TS 119 602 LoTE payload — the fields the anchor extraction walks. */
interface LotePayload {
  LoTE?: {
    TrustedEntitiesList?: Array<{
      TrustedEntityServices?: Array<{
        ServiceInformation?: {
          ServiceStatus?: string
          ServiceDigitalIdentity?: { X509Certificates?: Array<{ val?: unknown }> }
        }
      }>
    }>
  }
}

/** A `ServiceStatus` is considered active when its URI ends in `granted` (mirrors the backend rule). */
const isGranted = (status: string): boolean => status.trim().toLowerCase().endsWith('granted')

/**
 * Extract the granted trust-anchor certificates (base64 DER) from a LoTE payload:
 * `LoTE.TrustedEntitiesList[] → TrustedEntityServices[] → ServiceInformation →
 * ServiceDigitalIdentity.X509Certificates[].val`. Structural walk only — the backend publishing this
 * list schema-validates it (`assertValidLoTE`), and the surrounding frame verifies its signature.
 */
function extractLoteAnchors(payload: LotePayload): string[] {
  const anchors: string[] = []
  for (const entity of payload.LoTE?.TrustedEntitiesList ?? []) {
    for (const entityService of entity.TrustedEntityServices ?? []) {
      const info = entityService.ServiceInformation
      if (!info || !isGranted(info.ServiceStatus ?? '')) continue
      for (const certificate of info.ServiceDigitalIdentity?.X509Certificates ?? []) {
        if (typeof certificate.val === 'string' && certificate.val.trim()) {
          anchors.push(certificate.val.replace(/\s+/g, ''))
        }
      }
    }
  }
  return [...new Set(anchors)]
}

/** EU-list format: LoTE JWT (compact JWS) — the signature covers `header.payload`; chain in `x5c`. */
async function parseEuTrustListResponse(response: Response): Promise<ParseTrustSourceOutcome> {
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

  const payload = JSON.parse(base64UrlToString(payloadB64)) as LotePayload

  return {
    ok: true,
    parsed: {
      certificateChainBase64: x5c as string[],
      signedData: Uint8Array.from(Buffer.from(`${headerB64}.${payloadB64}`, 'utf8')),
      signature: base64UrlToBytes(signatureB64),
      issuerCertificates: extractLoteAnchors(payload),
    },
  }
}

/**
 * Fetch the Heka EU trust list (an **ETSI TS 119 602 LoTE JWT** over the unioned EU issuer anchors),
 * verify it (signer `x5c` chain → bundled service root; JWS ES256), and refresh the `'eu'` slice of
 * the issuer trust anchors. Best-effort and total — see {@link refreshTrustSource} for the shared
 * verify/degrade semantics.
 */
export async function refreshEuTrustList(agent: EuTrustListAgent, options: EuRefreshOptions): Promise<EuRefreshResult> {
  return refreshTrustSource(
    agent,
    'eu',
    {
      url: options.euTrustListUrl,
      trustedRootCertificates: options.trustedRootCertificates,
      fetchImpl: options.fetchImpl,
    },
    'no-eu-trust-list-url',
    parseEuTrustListResponse
  )
}
