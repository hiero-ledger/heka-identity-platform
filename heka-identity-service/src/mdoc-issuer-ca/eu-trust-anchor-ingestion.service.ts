import { X509Certificate } from '@credo-ts/core'
import { Inject, Injectable } from '@nestjs/common'
import { assertValidLoTE } from '@owf/eudi-lote'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { InjectLogger, Logger } from 'common/logger'

import { parseConfiguredAnchors, parseSignerCertificates, normalizeBase64Certificate } from './certificate-list'
import { decodeLoteJws, DecodedLoteJws, extractLoteAnchors, LOTE_JWT_TYP, readLoteListInfo } from './eu-lote'
import {
  EU_LOTE_ISSUER_SERVICE_TYPES,
  EU_TL_ISSUER_SERVICE_TYPES,
  narrowIssuerServiceTypes,
  splitCommaList,
} from './eu-service-types'
import {
  parseLotlPointers,
  parseTrustedListAnchors,
  parseTrustedListInfo,
  ListIssueInfo,
} from './eu-trusted-list-parser'
import { verifyTrustedListSignature } from './eu-trusted-list-signature'

/** The external anchor sources the service can ingest. */
export type IngestedTrustSource = 'config' | 'lotl' | 'lote'

/** Network limits for the trust documents (fetched in the background, never inside a verification). */
export interface TrustDocumentLimits {
  /** Per-request timeout, headers and body included. */
  timeoutMs: number
  /** Maximum size of a TS 119 612 XML document (the LoTL or a national Trusted List). */
  trustedListBytes: number
  /** Maximum size of a TS 119 602 LoTE JWS. */
  loteBytes: number
  /** How many national Trusted Lists are fetched at once during a LoTL traversal. */
  concurrency: number
}

/** Grace after a list's `NextUpdate` before it counts as stale (publisher clock skew, publication lag). */
export const LIST_NEXT_UPDATE_GRACE_MS = 5 * 60 * 1000

export const DEFAULT_TRUST_DOCUMENT_LIMITS: Readonly<TrustDocumentLimits> = {
  timeoutMs: 15_000,
  trustedListBytes: 20 * 1024 * 1024,
  loteBytes: 5 * 1024 * 1024,
  concurrency: 4,
}

/**
 * **Ingestion** of EU trust anchors — the one place that fetches, verifies and parses the official
 * lists: the eIDAS **List of Trusted Lists** (`lotl`, ETSI TS 119 612 / XAdES, QTSPs incl. QEAA
 * providers), the **Lists of Trusted Entities** (`lote`, ETSI TS 119 602, the wallet-era actors) and the
 * operator-curated partner (`config`) anchors, for the service's own verifier trust provider
 * (`VerifierTrustAnchorService`).
 *
 * Every list is individually FAIL-CLOSED (a tampered or unverifiable list only excludes its own anchors,
 * never injects any); across lists of one source the union is BEST-EFFORT and logged. Only
 * credential-issuer services become anchors (`eu-service-types.ts`), every fetch is bounded by
 * {@link TrustDocumentLimits}, and stale or replayed lists are rejected (`checkFreshnessAndRecordSequence`).
 */
@Injectable()
export class EuTrustAnchorIngestionService {
  /** Mutable so tests can tighten the limits; production uses the defaults. */
  public limits: TrustDocumentLimits = { ...DEFAULT_TRUST_DOCUMENT_LIMITS }

  /** Last accepted `TSLSequenceNumber` / `LoTESequenceNumber` per list location (this process only). */
  private readonly lastSequenceByLocation = new Map<string, number>()

  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    @InjectLogger(EuTrustAnchorIngestionService) private readonly logger: Logger,
  ) {}

  /** Resolve one source's anchors. */
  public async anchorsFromSource(source: IngestedTrustSource): Promise<X509Certificate[]> {
    if (source === 'lotl') return this.anchorsFromLotl()
    if (source === 'lote') return this.anchorsFromLote()
    return this.anchorsFromConfig()
  }

  /** The operator-curated partner anchors from `TRUST_LIST_PARTNER_CERTIFICATES` (no network). */
  public anchorsFromConfig(): X509Certificate[] {
    return parseConfiguredAnchors(this.agent.agencyConfig.trustListPartnerCertificates)
  }

  /**
   * Traverse the EU **List of Trusted Lists**: verify the LoTL against the pinned Commission
   * signer, then for each Member-State TL it points to, verify that TL against the signer the LoTL
   * **declared for it** (chain-based trust — the pin is derived from the verified LoTL, not static config)
   * and extract its granted anchors.
   *
   * BEST-EFFORT UNION: a national TL that fails to fetch/verify/parse is skipped and logged, so one
   * Member State's outage never collapses trust in the others — but each TL remains individually
   * FAIL-CLOSED, so a tampered TL only excludes its own anchors, never injects them. The LoTL root itself
   * is fail-closed: if its own signature can't be verified, the whole traversal throws.
   */
  public async anchorsFromLotl(): Promise<X509Certificate[]> {
    const lotlUrl = this.agent.agencyConfig.euLotlUrl
    if (!lotlUrl) {
      throw new Error('EU_LOTL_URL is required when a trust source list includes lotl')
    }
    const lotlXml = await this.fetchTrustDocument(lotlUrl, 'the EU List of Trusted Lists', this.limits.trustedListBytes)
    await verifyTrustedListSignature(lotlXml, parseSignerCertificates(this.agent.agencyConfig.euLotlSignerCertificates))
    this.checkFreshnessAndRecordSequence(lotlUrl, 'the EU List of Trusted Lists', parseTrustedListInfo(lotlXml))

    const schemeTerritories = splitCommaList(this.agent.agencyConfig.euLotlSchemeTerritories)
    const pointers = parseLotlPointers(lotlXml, { schemeTerritories })
    const serviceTypes = narrowIssuerServiceTypes(
      splitCommaList(this.agent.agencyConfig.euTrustedListServiceTypes),
      EU_TL_ISSUER_SERVICE_TYPES,
      'EU_TRUSTED_LIST_SERVICE_TYPES',
    )

    const anchors: X509Certificate[] = []
    const dropped: { territory: string; location: string; reason: string }[] = []
    await mapWithConcurrency(pointers, this.limits.concurrency, async (pointer) => {
      try {
        const tlXml = await this.fetchTrustDocument(
          pointer.location,
          `national Trusted List ${pointer.schemeTerritory || pointer.location}`,
          this.limits.trustedListBytes,
        )
        await verifyTrustedListSignature(tlXml, pointer.expectedSigners)
        this.checkFreshnessAndRecordSequence(
          pointer.location,
          `national Trusted List ${pointer.schemeTerritory || pointer.location}`,
          parseTrustedListInfo(tlXml),
        )
        anchors.push(...this.extractAnchors(tlXml, serviceTypes))
      } catch (error) {
        dropped.push({
          territory: pointer.schemeTerritory || '(unknown)',
          location: pointer.location,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    })

    if (dropped.length > 0) {
      // Best-effort union MUST NOT silently under-cover — name every skipped Member State.
      this.logger.warn(
        { dropped, verified: pointers.length - dropped.length, total: pointers.length },
        `EU LoTL traversal: skipped ${dropped.length}/${pointers.length} national Trusted List(s)`,
      )
    }

    return anchors
  }

  /**
   * Ingest the configured **ETSI TS 119 602 LoTE** lists (the EUDI-era lists: PID providers,
   * wallet providers, registrars, pub-EAA providers). Each list is a compact JWS whose `x5c` leaf must
   * byte-match a pinned `EU_LOTE_SIGNER_CERTIFICATES` entry (FAIL-CLOSED per list), then schema-validated
   * before its granted anchors are extracted. BEST-EFFORT UNION across lists; throws when every
   * configured list failed.
   */
  public async anchorsFromLote(): Promise<X509Certificate[]> {
    const urls = splitCommaList(this.agent.agencyConfig.euLoteUrls)
    if (urls.length === 0) {
      throw new Error('EU_LOTE_URLS is required when a trust source list includes lote')
    }
    const pinnedSigners = parseSignerCertificates(this.agent.agencyConfig.euLoteSignerCertificates)
    const serviceTypes = narrowIssuerServiceTypes(
      splitCommaList(this.agent.agencyConfig.euLoteServiceTypes),
      EU_LOTE_ISSUER_SERVICE_TYPES,
      'EU_LOTE_SERVICE_TYPES',
    )

    const anchors: X509Certificate[] = []
    const dropped: { url: string; reason: string }[] = []
    for (const url of urls) {
      try {
        const jws = await this.fetchTrustDocument(url, `LoTE ${url}`, this.limits.loteBytes)
        const decoded = decodeLoteJws(jws)
        await this.verifyLoteSignature(decoded, pinnedSigners)
        assertValidLoTE(decoded.payload)
        this.checkFreshnessAndRecordSequence(url, `LoTE ${url}`, readLoteListInfo(decoded.payload))
        anchors.push(
          ...extractLoteAnchors(decoded.payload, { serviceTypes }).map((base64) =>
            X509Certificate.fromEncodedCertificate(base64),
          ),
        )
      } catch (error) {
        dropped.push({ url, reason: error instanceof Error ? error.message : String(error) })
      }
    }

    if (dropped.length > 0) {
      this.logger.warn(
        { dropped, verified: urls.length - dropped.length, total: urls.length },
        `EU LoTE ingestion: skipped ${dropped.length}/${urls.length} list(s)`,
      )
    }
    if (dropped.length === urls.length) {
      throw new Error(
        `All ${urls.length} configured LoTE list(s) failed: ${dropped.map((drop) => drop.reason).join('; ')}`,
      )
    }
    return anchors
  }

  /**
   * Freshness and replay guard for one **signature-verified** list: reject a list past its `NextUpdate`
   * (plus {@link LIST_NEXT_UPDATE_GRACE_MS}) and a sequence number lower than the last one accepted from the
   * same location; record the sequence on acceptance. A list without a `NextUpdate` (a closed list) or
   * without a sequence number is not judged on that criterion.
   */
  private checkFreshnessAndRecordSequence(location: string, label: string, info: ListIssueInfo): void {
    if (info.nextUpdate && info.nextUpdate.getTime() + LIST_NEXT_UPDATE_GRACE_MS < Date.now()) {
      throw new Error(`${label} is stale: its NextUpdate ${info.nextUpdate.toISOString()} has passed`)
    }
    if (info.sequenceNumber !== undefined) {
      const last = this.lastSequenceByLocation.get(location)
      if (last !== undefined && info.sequenceNumber < last) {
        throw new Error(`${label} sequence number regressed: got ${info.sequenceNumber}, last accepted ${last}`)
      }
      this.lastSequenceByLocation.set(location, info.sequenceNumber)
    }
  }

  /**
   * Verify a decoded LoTE JWS: `typ` must be `trustlist+jwt`, the `x5c` leaf must byte-match a pinned
   * signer, and the ES256 signature must verify with that leaf's key. FAIL-CLOSED: throws on any failure.
   */
  private async verifyLoteSignature(decoded: DecodedLoteJws, pinnedSignerCertificates: string[]): Promise<void> {
    if (pinnedSignerCertificates.length === 0) {
      throw new Error('No trusted LoTE signer certificates were provided (EU_LOTE_SIGNER_CERTIFICATES).')
    }
    if (decoded.header.typ !== LOTE_JWT_TYP) {
      throw new Error(`LoTE JWS has unexpected typ '${String(decoded.header.typ)}' (expected '${LOTE_JWT_TYP}')`)
    }
    const x5c = decoded.header.x5c
    if (!Array.isArray(x5c) || x5c.length === 0 || !x5c.every((entry) => typeof entry === 'string')) {
      throw new Error('LoTE JWS carries no x5c signing certificate chain')
    }
    const leaf = normalizeBase64Certificate(x5c[0])
    if (!pinnedSignerCertificates.includes(leaf)) {
      throw new Error('LoTE signer certificate is not a pinned trust anchor')
    }
    const signerCertificate = X509Certificate.fromEncodedCertificate(leaf)
    const { verified } = await this.agent.kms.verify({
      key: { publicJwk: signerCertificate.publicJwk.toJson() },
      algorithm: 'ES256',
      data: Uint8Array.from(Buffer.from(decoded.signingInput, 'utf8')),
      signature: decoded.signature,
    })
    if (!verified) {
      throw new Error('LoTE signature is invalid.')
    }
  }

  /**
   * Fetch a trust-list document (TL/LoTL XML or LoTE JWS) within the limits: the request times out after
   * `limits.timeoutMs`, and a body larger than `maxBytes` — declared or streamed — is abandoned. Throws a
   * labelled error on any failure.
   */
  private async fetchTrustDocument(url: string, label: string, maxBytes: number): Promise<string> {
    const where = `${label} (${url})`
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(this.limits.timeoutMs) })
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? `timed out after ${this.limits.timeoutMs} ms`
          : error instanceof Error
            ? error.message
            : String(error)
      throw new Error(`Failed to fetch ${where}: ${reason}`, { cause: error })
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch ${where}: HTTP ${response.status}`)
    }
    const declaredLength = Number(response.headers?.get?.('content-length') ?? Number.NaN)
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(`${where} is too large: ${declaredLength} bytes declared (limit ${maxBytes})`)
    }
    return readBodyBounded(response, maxBytes, where)
  }

  /** Parse the granted issuer anchors of the given service types from a (already signature-verified) Trusted List XML. */
  private extractAnchors(xml: string, serviceTypes: readonly string[]): X509Certificate[] {
    return parseTrustedListAnchors(xml, { serviceTypes }).map((base64) =>
      X509Certificate.fromEncodedCertificate(base64),
    )
  }
}

/**
 * Read a response body as UTF-8 text, giving up as soon as more than `maxBytes` have arrived (the stream
 * is cancelled, nothing further is buffered). Falls back to `text()` for bodies that expose no stream.
 */
async function readBodyBounded(response: Response, maxBytes: number, where: string): Promise<string> {
  const tooLarge = () => new Error(`${where} is too large: more than ${maxBytes} bytes (limit ${maxBytes})`)
  const body = response.body
  if (!body || typeof body.getReader !== 'function') {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw tooLarge()
    return text
  }
  const reader = body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Run `work` over `items` with at most `limit` in flight; `work` must handle its own errors. */
async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      await work(item)
    }
  })
  await Promise.all(workers)
}
