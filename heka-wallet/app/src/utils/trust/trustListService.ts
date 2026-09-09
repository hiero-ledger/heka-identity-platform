import { encodeSigStructure } from './cbor'
import {
  ParseTrustSourceOutcome,
  refreshTrustSource,
  TrustSourceRefreshResult,
  TrustVerifyAgent,
} from './trustSourceRefresh'
import { parseVical } from './vical'

/** The agent surface the refresh needs — see {@link TrustVerifyAgent}. */
export type TrustListAgent = TrustVerifyAgent

export interface RefreshOptions {
  /** URL of the Heka VICAL endpoint (`GET /vical`). */
  vicalUrl?: string
  /** Bundled service root CA cert(s) (base64 DER) the VICAL signer must chain to. */
  trustedRootCertificates: string[]
  /** Override for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

export type RefreshResult = TrustSourceRefreshResult

/** VICAL format: COSE_Sign1 CBOR — the signature covers the rebuilt canonical `Signature1` Sig_structure. */
async function parseVicalResponse(response: Response): Promise<ParseTrustSourceOutcome> {
  const bytes = new Uint8Array(await response.arrayBuffer())
  const parsed = parseVical(bytes)
  return {
    ok: true,
    parsed: {
      certificateChainBase64: parsed.certificateChainBase64,
      signedData: encodeSigStructure(parsed.protectedHeader, parsed.payload),
      signature: parsed.signature,
      issuerCertificates: parsed.certificateInfos.map((info) => info.certificateBase64),
      vicalIssueID: parsed.vicalIssueID,
    },
  }
}

/**
 * Fetch the Heka VICAL, verify it (signer chain → bundled service root; COSE_Sign1 ES256), and refresh
 * the `'vical'` slice of the issuer trust anchors with the listed per-tenant IACAs. Best-effort and
 * total — see {@link refreshTrustSource} for the shared verify/degrade semantics.
 */
export async function refreshIssuerTrustList(agent: TrustListAgent, options: RefreshOptions): Promise<RefreshResult> {
  return refreshTrustSource(
    agent,
    'vical',
    { url: options.vicalUrl, trustedRootCertificates: options.trustedRootCertificates, fetchImpl: options.fetchImpl },
    'no-vical-url',
    parseVicalResponse
  )
}
