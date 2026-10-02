import type { AgentContext, X509VerificationContext } from '@credo-ts/core'

import { Mdoc } from '@credo-ts/core'
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { InjectLogger, Logger } from 'common/logger'
import { X509SignerService } from 'x509-signing'

import { dedupeCertificates } from './certificate-list'
import { EuTrustAnchorIngestionService } from './eu-trust-anchor-ingestion.service'
import { readIacaRegistry } from './iaca-registry'

/** The anchor sources the service consults when it verifies credentials in its relying-party role. */
export type VerifierTrustSource = 'registry' | 'config' | 'lotl' | 'lote'
export const VERIFIER_TRUST_SOURCES: readonly VerifierTrustSource[] = ['registry', 'config', 'lotl', 'lote']

type EuSource = Extract<VerifierTrustSource, 'lotl' | 'lote'>

/**
 * Trust anchors for the identity service **as a Relying Party** — what Credo may trust when the service
 * itself verifies a presented credential (`X509ModuleConfig.getTrustedCertificatesForVerification`).
 * This is the consumer side of the EU lists the EUDI Architecture and Reference Framework (ARF,
 * OIA_13 / OIA_15a/b) requires of every RP, and the only place the tenants' own issuer anchors reach the service's verifier.
 *
 * Trust set by verification context (`VERIFIER_TRUST_SOURCES` gates each part):
 *  - **mdoc** (MSO issuer chain): the tenants' IACAs from the global registry (`registry`), the curated
 *    partner (`config`) anchors, the cached EU anchors (`lotl` / `lote`), plus the legacy `MDL_ISSUER_CERTIFICATE`
 *    as a fallback. Never the service root — a service-root-signed leaf must not be able to forge an MSO.
 *  - **SD-JWT VC / W3C JWT** (`x5c` chains): the service root (`registry`; the tenants' SD-JWT issuer
 *    leaves chain to it), `config` and the EU anchors.
 *  - any other context (request signing, key/client attestations, issuer metadata): `undefined`, i.e.
 *    Credo's globally registered trusted certificates apply unchanged.
 *
 * The EU sources are fetched **outside the verification path**: a per-source snapshot is refreshed in
 * the background every `VERIFIER_TRUST_REFRESH_SECONDS` and on first use; a failing refresh keeps that
 * source's last good snapshot (graceful degrade, logged), so a Member-State outage never empties trust.
 */
@Injectable()
export class VerifierTrustAnchorService implements OnModuleInit, OnModuleDestroy {
  private readonly euSnapshots = new Map<EuSource, string[]>()
  private euRefreshedAtMs = 0
  private euRefreshing: Promise<void> | null = null
  private refreshTimer: NodeJS.Timeout | null = null

  public constructor(
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    private readonly x509SignerService: X509SignerService,
    private readonly ingestion: EuTrustAnchorIngestionService,
    @InjectLogger(VerifierTrustAnchorService) private readonly logger: Logger,
  ) {}

  public onModuleInit(): void {
    if (this.euSources.length === 0) return
    const intervalMs = this.agent.agencyConfig.verifierTrustRefreshSeconds * 1000
    // Warm the snapshot so the first verification does not pay for a LoTL traversal, then keep it fresh.
    void this.refreshEuAnchors().catch(() => undefined)
    this.refreshTimer = setInterval(() => void this.refreshEuAnchors().catch(() => undefined), intervalMs)
    this.refreshTimer.unref()
  }

  public onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  /** The configured sources (validated at startup by the agent config). */
  public get sources(): readonly VerifierTrustSource[] {
    return this.agent.agencyConfig.verifierTrustSources
  }

  /**
   * Credo hook: the trusted certificates for one verification, or `undefined` to fall back to the
   * globally registered ones. Base64 DER strings (Credo also accepts PEM).
   */
  public async getTrustedCertificatesForVerification(
    _agentContext: AgentContext,
    { verification }: X509VerificationContext,
  ): Promise<string[] | undefined> {
    if (verification.type !== 'credential') return undefined

    const sources = this.sources
    const anchors: string[] = []
    const isMdoc = verification.credential instanceof Mdoc

    if (isMdoc) {
      if (sources.includes('registry')) {
        anchors.push(...(await this.registryIacaAnchors()))
      }
      // `MDL_ISSUER_CERTIFICATE`: extra mdoc anchor kept for backwards compatibility.
      const legacy = this.agent.agencyConfig.mdlIssuerCertificate
      if (legacy) anchors.push(legacy)
    } else if (sources.includes('registry')) {
      const root = await this.x509SignerService.getServiceRootCertificate()
      if (root) anchors.push(root.certificateBase64)
    }

    if (sources.includes('config')) {
      anchors.push(...this.ingestion.anchorsFromConfig().map((certificate) => certificate.toString('base64')))
    }
    if (this.euSources.length > 0) {
      anchors.push(...(await this.euAnchors()))
    }

    return Array.from(new Set(anchors))
  }

  /**
   * Refresh every configured EU source. Per source: success replaces its snapshot, failure keeps the
   * previous one and is logged. Concurrent callers share one in-flight refresh.
   */
  public refreshEuAnchors(): Promise<void> {
    if (this.euRefreshing) return this.euRefreshing
    this.euRefreshing = this.doRefreshEuAnchors().finally(() => {
      this.euRefreshing = null
    })
    return this.euRefreshing
  }

  private async doRefreshEuAnchors(): Promise<void> {
    const failed: { source: EuSource; reason: string }[] = []
    for (const source of this.euSources) {
      try {
        const anchors = await this.ingestion.anchorsFromSource(source)
        this.euSnapshots.set(
          source,
          dedupeCertificates(anchors).map((certificate) => certificate.toString('base64')),
        )
      } catch (error) {
        failed.push({ source, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    this.euRefreshedAtMs = Date.now()
    if (failed.length > 0) {
      this.logger.warn(
        { failed, retained: failed.map((failure) => this.euSnapshots.get(failure.source)?.length ?? 0) },
        `Verifier trust anchors: ${failed.length}/${this.euSources.length} EU source(s) failed to refresh; keeping last good snapshot(s)`,
      )
    }
  }

  private get euSources(): EuSource[] {
    return this.sources.filter((source): source is EuSource => source === 'lotl' || source === 'lote')
  }

  /** Current EU anchors: blocks only for the very first load, otherwise serves the snapshot and refreshes stale ones in the background. */
  private async euAnchors(): Promise<string[]> {
    if (this.euRefreshedAtMs === 0) {
      await this.refreshEuAnchors()
    } else if (Date.now() - this.euRefreshedAtMs > this.agent.agencyConfig.verifierTrustRefreshSeconds * 1000) {
      void this.refreshEuAnchors().catch(() => undefined)
    }
    return this.euSources.flatMap((source) => this.euSnapshots.get(source) ?? [])
  }

  private async registryIacaAnchors(): Promise<string[]> {
    const entries = await readIacaRegistry(this.agent)
    return entries.map((entry) => entry.certificateBase64)
  }
}
