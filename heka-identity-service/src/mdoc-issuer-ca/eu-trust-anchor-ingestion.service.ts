import { X509Certificate } from '@credo-ts/core'
import { Inject, Injectable } from '@nestjs/common'
import { assertValidLoTE } from '@owf/eudi-lote'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { InjectLogger, Logger } from 'common/logger'

import { parseConfiguredAnchors, parseSignerCertificates, normalizeBase64Certificate } from './certificate-list'
import { parseLotlPointers, parseTrustedListAnchors } from './etsi-tsl.parser'
import { decodeLoteJws, DecodedLoteJws, extractLoteAnchors, LOTE_JWT_TYP } from './eu-lote'
import { verifyTrustedListSignature } from './eu-trusted-list.verify'

/** The external anchor sources the service can ingest. */
export type EuTrustAnchorSource = 'config' | 'lotl' | 'lote'

/**
 * **Ingestion** of EU trust anchors — the one place that fetches, verifies and parses the official
 * lists: the eIDAS **List of Trusted Lists** (`lotl`, ETSI TS 119 612 / XAdES, QTSPs incl. QEAA
 * providers), the **Lists of Trusted Entities** (`lote`, ETSI TS 119 602, the wallet-era actors) and the
 * operator-curated partner (`config`) anchors, for the service's own verifier trust provider
 * ({@link VerifierTrustAnchorService}). Nothing ingested here is ever republished.
 *
 * Every list is individually FAIL-CLOSED (a tampered or unverifiable list only excludes its own anchors,
 * never injects any); across lists of one source the union is BEST-EFFORT and logged.
 */
@Injectable()
export class EuTrustAnchorIngestionService {
  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    @InjectLogger(EuTrustAnchorIngestionService) private readonly logger: Logger,
  ) {}

  /** Resolve one source's anchors. */
  public async anchorsFromSource(source: EuTrustAnchorSource): Promise<X509Certificate[]> {
    if (source === 'lotl') return this.anchorsFromLotl()
    if (source === 'lote') return this.anchorsFromLote()
    return this.configuredAnchors()
  }

  /** The operator-curated partner anchors from `TRUST_LIST_PARTNER_CERTIFICATES` (no network). */
  public configuredAnchors(): X509Certificate[] {
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
    const lotlXml = await this.fetchTrustDocument(lotlUrl, 'the EU List of Trusted Lists')
    // FAIL-CLOSED at the root: the whole traversal is only as trustworthy as the LoTL's own signature.
    await verifyTrustedListSignature(lotlXml, parseSignerCertificates(this.agent.agencyConfig.euLotlSignerCertificates))

    const schemeTerritories = this.splitConfigList(this.agent.agencyConfig.euLotlSchemeTerritories)
    const pointers = parseLotlPointers(lotlXml, { schemeTerritories })

    const anchors: X509Certificate[] = []
    const dropped: { territory: string; location: string; reason: string }[] = []
    for (const pointer of pointers) {
      try {
        const tlXml = await this.fetchTrustDocument(
          pointer.location,
          `national Trusted List ${pointer.schemeTerritory || pointer.location}`,
        )
        // Chain-based signer trust: the pin is the signer the (verified) LoTL declared for THIS TL.
        await verifyTrustedListSignature(tlXml, pointer.expectedSigners)
        anchors.push(...this.extractAnchors(tlXml))
      } catch (error) {
        dropped.push({
          territory: pointer.schemeTerritory || '(unknown)',
          location: pointer.location,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

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
    const urls = this.splitConfigList(this.agent.agencyConfig.euLoteUrls)
    if (urls.length === 0) {
      throw new Error('EU_LOTE_URLS is required when a trust source list includes lote')
    }
    const pinnedSigners = parseSignerCertificates(this.agent.agencyConfig.euLoteSignerCertificates)
    const serviceTypes = this.splitConfigList(this.agent.agencyConfig.euLoteServiceTypes)

    const anchors: X509Certificate[] = []
    const dropped: { url: string; reason: string }[] = []
    for (const url of urls) {
      try {
        const jws = await this.fetchTrustDocument(url, `LoTE ${url}`)
        const decoded = decodeLoteJws(jws)
        await this.verifyLoteSignature(decoded, pinnedSigners)
        assertValidLoTE(decoded.payload)
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

  /** De-duplicate certificates by base64 DER (two sources/lists may carry the same cross-border CA). */
  public dedupeByDer(certificates: X509Certificate[]): X509Certificate[] {
    const seen = new Set<string>()
    const unique: X509Certificate[] = []
    for (const certificate of certificates) {
      const der = certificate.toString('base64')
      if (seen.has(der)) continue
      seen.add(der)
      unique.push(certificate)
    }
    return unique
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

  /** Fetch a trust-list document (TL/LoTL XML or LoTE JWS), throwing a labelled error on network/HTTP failure. */
  private async fetchTrustDocument(url: string, label: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${label} (${url}): HTTP ${response.status}`)
    }
    return response.text()
  }

  /** Parse the granted issuer anchors from a (already signature-verified) Trusted List XML. */
  private extractAnchors(xml: string): X509Certificate[] {
    const serviceTypes = this.splitConfigList(this.agent.agencyConfig.euTrustedListServiceTypes)
    return parseTrustedListAnchors(xml, { serviceTypes }).map((base64) =>
      X509Certificate.fromEncodedCertificate(base64),
    )
  }

  private splitConfigList(raw: string): string[] {
    return (raw ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
}
