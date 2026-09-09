import { X509Certificate } from '@credo-ts/core'

import { issuerTrustStore, IssuerTrustSource } from './issuerTrustStore'

/**
 * Shared frame for refreshing one source of the issuer trust store from a signed trust list. The two
 * sources (`'vical'` COSE/CBOR, `'eu'` JWS/JSON) differ only in how the fetched body is parsed into
 * signature-verification inputs — everything else (guards, fetch, chain validation to the bundled
 * service roots, ES256 verification, store update, graceful-degrade error handling) lives here once.
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

export interface TrustSourceRefreshOptions {
  /** URL of the signed trust list. */
  url?: string
  /** Bundled service root CA cert(s) (base64 DER) the list signer must chain to. */
  trustedRootCertificates: string[]
  /** Override for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

export interface TrustSourceRefreshResult {
  ok: boolean
  reason?: string
  issuerCount?: number
  vicalIssueID?: number
}

/** What a format-specific parser extracts from the fetched trust-list body. */
export interface ParsedTrustSource {
  /** Signer chain (leaf first, base64 DER) — validated against the bundled roots. */
  certificateChainBase64: string[]
  /** The exact bytes the list's ES256 signature covers (Sig_structure / JWS signing input). */
  signedData: Uint8Array
  /** Raw r‖s ES256 signature bytes. */
  signature: Uint8Array
  /** The issuer certificates (base64 DER) to trust once the list verifies. */
  issuerCertificates: string[]
  vicalIssueID?: number
}

export type ParseTrustSourceOutcome = { ok: true; parsed: ParsedTrustSource } | { ok: false; reason: string }

/**
 * Fetch a signed trust list, verify it, and replace `source`'s slice of the issuer trust store:
 *  1. fetch → format-specific `parse` (chain + signed bytes + signature + anchors).
 *  2. Validate the signer chain terminates at a bundled service root CA.
 *  3. Verify the ES256 signature with the signer leaf's key.
 *  4. Trust the anchors the (now-verified) list carries.
 *
 * Best-effort and total: never throws. Returns a result so callers can log; on any failure the
 * previously-trusted set for `source` is left untouched (graceful degrade).
 */
export async function refreshTrustSource(
  agent: TrustVerifyAgent,
  source: IssuerTrustSource,
  options: TrustSourceRefreshOptions,
  missingUrlReason: string,
  parse: (response: Response) => Promise<ParseTrustSourceOutcome>
): Promise<TrustSourceRefreshResult> {
  const { url, trustedRootCertificates } = options
  const doFetch = options.fetchImpl ?? fetch

  if (!url) return { ok: false, reason: missingUrlReason }
  if (trustedRootCertificates.length === 0) return { ok: false, reason: 'no-trusted-root' }

  try {
    const response = await doFetch(url)
    if (!response.ok) return { ok: false, reason: `http-${response.status}` }

    const outcome = await parse(response)
    if (!outcome.ok) return { ok: false, reason: outcome.reason }
    const { certificateChainBase64, signedData, signature, issuerCertificates, vicalIssueID } = outcome.parsed

    // 1) The list signer must chain to a bundled service root (anchors the whole trust list).
    await agent.x509.validateCertificateChain({
      certificateChain: certificateChainBase64,
      trustedCertificates: trustedRootCertificates,
    })

    // 2) The list signature must verify with the signer leaf key over the canonical signed bytes.
    const signerLeaf = X509Certificate.fromEncodedCertificate(certificateChainBase64[0])
    const { verified } = await agent.kms.verify({
      key: { publicJwk: signerLeaf.publicJwk.toJson() },
      algorithm: 'ES256',
      data: signedData,
      signature,
    })
    if (!verified) return { ok: false, reason: 'invalid-signature' }

    // 3) Trust the anchors the verified list carries.
    issuerTrustStore.setIssuerCertificates(source, issuerCertificates)
    return {
      ok: true,
      issuerCount: issuerCertificates.length,
      ...(vicalIssueID !== undefined ? { vicalIssueID } : {}),
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown-error' }
  }
}
