import type { GenericRecord } from '@credo-ts/core'

import { X509Certificate } from '@credo-ts/core'
import { Inject, Injectable } from '@nestjs/common'
import { assertValidLoTE, createLoTE, signLoTE, TrustedEntity } from '@owf/eudi-lote'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { InjectLogger, Logger } from 'common/logger'
import { ManagedCertificateService } from 'x509-signing'

import { parseConfiguredAnchors, parseSignerCertificates, normalizeBase64Certificate } from './certificate-list'
import { parseLotlPointers, parseTrustedListAnchors } from './etsi-tsl.parser'
import { decodeLoteJws, DecodedLoteJws, extractLoteAnchors, LOTE_JWT_TYP } from './eu-lote'
import { verifyTrustedListSignature } from './eu-trusted-list.verify'

const EU_SIGNER_RECORD_TYPE = 'eu-trust-list-signer'
const EU_SIGNER_COMMON_NAME = 'Heka EU Trust List Signer'
const EU_SIGNER_VALIDITY_DAYS = 365
const MS_PER_DAY = 24 * 60 * 60 * 1000
// The list is re-signed/refreshed weekly (mirrors the VICAL cadence); wallets refresh on this window.
// Well inside the 6-month maximum LoTE validity (ETSI TS 119 602).
const NEXT_UPDATE_DAYS = 7
// TS 119 612 §5.5.4 'granted' status URI — reused for the entries of the published Heka LoTE (the
// consumer side accepts any status URI ending in 'granted', so cross-spec vocabularies interoperate).
const GRANTED_STATUS_URI = 'http://uri.etsi.org/TrstSvc/Svcstatus/granted'

/** Wrap base64 DER in PEM armor (the form `signLoTE`'s `certificates` option expects). */
function toPemCertificate(base64Der: string): string {
  return `-----BEGIN CERTIFICATE-----\n${base64Der}\n-----END CERTIFICATE-----`
}

/**
 * Publishes the Heka **EU trust list** as an **ETSI TS 119 602 LoTE JWT** (`typ: trustlist+jwt`,
 * signed ES256, `x5c` = a dedicated EU-list signer leaf under the **service root CA**) — so a wallet
 * that trusts the one long-lived service root can verify the list, and any EUDI-aware consumer can
 * parse it.
 *
 * The anchor set is the **union of the configured sources** (`EU_TRUST_LIST_SOURCE`, comma-separated):
 * curated `config` anchors, the eIDAS **LoTL traversal** (`lotl`, ETSI TS 119 612 / XAdES) and
 * **LoTE ingestion** (`lote`, ETSI TS 119 602). A failing source is skipped + logged (best-effort
 * union — its anchors are excluded, never injected); if EVERY source fails the build fails closed.
 */
@Injectable()
export class EuTrustListService {
  private cached: { jws: string; expiresAtMs: number } | null = null
  private building: Promise<string> | null = null

  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    private readonly managedCertificateService: ManagedCertificateService,
    @InjectLogger(EuTrustListService) private readonly logger: Logger,
  ) {}

  /** The current signed LoTE JWT (compact JWS), rebuilt lazily when the ~7-day window has passed. */
  public async getTrustList(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAtMs) {
      return this.cached.jws
    }
    if (this.building) {
      return this.building
    }
    this.building = this.build().finally(() => {
      this.building = null
    })
    return this.building
  }

  private async build(): Promise<string> {
    const signer = await this.ensureSigner()
    const anchors = await this.resolveAnchorCertificates()
    const sequenceNumber = await this.nextSequenceNumber(signer.record)

    const now = new Date()
    const lote = createLoTE(
      {
        SchemeOperatorName: [{ lang: 'en', value: this.agent.agencyConfig.euTrustListProvider }],
        LoTESequenceNumber: sequenceNumber,
        ListIssueDateTime: now.toISOString(),
        NextUpdate: new Date(now.getTime() + NEXT_UPDATE_DAYS * MS_PER_DAY).toISOString(),
      },
      anchors.map((certificate) => this.toTrustedEntity(certificate)),
    )
    // Never publish a list that does not validate against the TS 119 602 schema.
    assertValidLoTE(lote)

    const signed = await signLoTE({
      lote,
      keyId: signer.keyId,
      algorithm: 'ES256',
      certificates: signer.chainBase64.map(toPemCertificate), // x5c: [signer leaf, service root]
      signer: async (data) => {
        const { signature } = await this.agent.kms.sign({
          keyId: signer.keyId,
          algorithm: 'ES256',
          data: Buffer.from(data, 'utf8'),
        })
        return Buffer.from(signature).toString('base64url')
      },
    })

    this.cached = { jws: signed.jws, expiresAtMs: now.getTime() + NEXT_UPDATE_DAYS * MS_PER_DAY }
    return signed.jws
  }

  /** One LoTE trusted entity per anchor: the issuer-CA subject with a single granted service carrying the cert. */
  private toTrustedEntity(certificate: X509Certificate): TrustedEntity {
    return {
      TrustedEntityInformation: {
        TEName: [{ lang: 'en', value: certificate.data.subject || 'Unknown issuer CA' }],
        // The entity's own contact details are unknown for republished external anchors — empty
        // address arrays are the schema-valid "not provided" shape.
        TEAddress: { TEPostalAddress: [], TEElectronicAddress: [] },
      },
      TrustedEntityServices: [
        {
          ServiceInformation: {
            ServiceName: [{ lang: 'en', value: 'Issuer CA trust anchor' }],
            ServiceStatus: GRANTED_STATUS_URI,
            StatusStartingTime: new Date().toISOString(),
            ServiceDigitalIdentity: { X509Certificates: [{ val: certificate.toString('base64') }] },
          },
        },
      ],
    }
  }

  /**
   * Resolve the anchor union across the configured sources. Best-effort: a failing source is skipped
   * and logged (excludes its own anchors, never injects) — but if EVERY configured source fails, the
   * build fails closed rather than publishing an empty-but-signed list.
   */
  private async resolveAnchorCertificates(): Promise<X509Certificate[]> {
    const sources = this.agent.agencyConfig.euTrustListSources
    const anchors: X509Certificate[] = []
    const failed: { source: string; reason: string }[] = []

    for (const source of sources) {
      try {
        anchors.push(...(await this.anchorsFromSource(source)))
      } catch (error) {
        failed.push({ source, reason: error instanceof Error ? error.message : String(error) })
      }
    }

    if (sources.length > 0 && failed.length === sources.length) {
      throw new Error(
        `EU trust list: all configured anchor sources failed — ${failed
          .map((failure) => `${failure.source}: ${failure.reason}`)
          .join('; ')}`,
      )
    }
    if (failed.length > 0) {
      this.logger.warn({ failed, sources }, `EU trust list: ${failed.length}/${sources.length} anchor source(s) failed`)
    }
    return this.dedupeByDer(anchors)
  }

  private async anchorsFromSource(source: 'config' | 'lotl' | 'lote'): Promise<X509Certificate[]> {
    if (source === 'lotl') return this.anchorsFromLotl()
    if (source === 'lote') return this.anchorsFromLote()
    return parseConfiguredAnchors(this.agent.agencyConfig.euTrustedIssuerCertificates)
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
  private async anchorsFromLotl(): Promise<X509Certificate[]> {
    const lotlUrl = this.agent.agencyConfig.euLotlUrl
    if (!lotlUrl) {
      throw new Error('EU_LOTL_URL is required when EU_TRUST_LIST_SOURCE includes lotl')
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
  private async anchorsFromLote(): Promise<X509Certificate[]> {
    const urls = this.splitConfigList(this.agent.agencyConfig.euLoteUrls)
    if (urls.length === 0) {
      throw new Error('EU_LOTE_URLS is required when EU_TRUST_LIST_SOURCE includes lote')
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

  /** De-duplicate certificates by base64 DER (two sources/lists may carry the same cross-border CA). */
  private dedupeByDer(certificates: X509Certificate[]): X509Certificate[] {
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

  private splitConfigList(raw: string): string[] {
    return (raw ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  /**
   * The service-wide EU-trust-list signer (global store): a service-root-signed leaf managed
   * (provisioned, auto-renewed) by {@link ManagedCertificateService} under the global agent's root
   * context. Same posture as the VICAL signer. The backing record also carries the LoTE sequence
   * counter (preserved across renewals by the provider's content-spread).
   */
  private async ensureSigner(): Promise<{ keyId: string; chainBase64: string[]; record: GenericRecord }> {
    const managed = await this.managedCertificateService.ensureCertificate(this.agent.context, {
      recordType: EU_SIGNER_RECORD_TYPE,
      commonName: EU_SIGNER_COMMON_NAME,
      validityDays: EU_SIGNER_VALIDITY_DAYS,
    })
    return {
      keyId: managed.keyId,
      chainBase64: managed.chain.map((certificate) => certificate.toString('base64')),
      record: managed.record,
    }
  }

  /** Monotonic LoTE sequence number (TS 119 602 `LoTESequenceNumber`), persisted on the signer record. */
  private async nextSequenceNumber(record: GenericRecord): Promise<number> {
    const content = record.content as { loteSequenceNumber?: number }
    const next = (content.loteSequenceNumber ?? 0) + 1
    record.content = { ...record.content, loteSequenceNumber: next }
    await this.agent.genericRecords.update(record)
    return next
  }
}
