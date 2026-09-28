import type { AgentContext, X509VerificationContext } from '@credo-ts/core'

import { Mdoc, X509Certificate } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'

import { Agent } from 'common/agent'
import { Logger } from 'common/logger'
import { X509SignerService } from 'x509-signing'

import { EuTrustAnchorIngestionService } from '../eu-trust-anchor-ingestion.service'
import { VerifierTrustAnchorService, VerifierTrustSource } from '../verifier-trust-anchor.service'

const IACA_A = 'IACA-A'
const IACA_B = 'IACA-B'
const CONFIG_ANCHOR = 'CONFIG-ANCHOR'
const LOTL_ANCHOR = 'LOTL-ANCHOR'
const LOTE_ANCHOR = 'LOTE-ANCHOR'
const SERVICE_ROOT = 'SERVICE-ROOT'
const LEGACY_MDL_CERT = 'LEGACY-MDL-CERT'

/** A stand-in `X509Certificate` whose base64 form is the given tag (the service only calls `toString('base64')`). */
const fakeCertificate = (base64: string): X509Certificate => ({ toString: () => base64 }) as unknown as X509Certificate

const mdocContext = (): X509VerificationContext =>
  ({
    certificateChain: [],
    verification: { type: 'credential', credential: Object.create(Mdoc.prototype) },
  }) as unknown as X509VerificationContext

const sdJwtContext = (): X509VerificationContext =>
  ({
    certificateChain: [],
    verification: { type: 'credential', credential: { compact: 'a.b.c' } },
  }) as unknown as X509VerificationContext

const requestContext = (): X509VerificationContext =>
  ({
    certificateChain: [],
    verification: { type: 'oauth2SecuredAuthorizationRequest', authorizationRequest: { jwt: 'x', payload: {} } },
  }) as unknown as X509VerificationContext

describe('VerifierTrustAnchorService — trust anchors for the service as Relying Party', () => {
  const agentContext = {} as AgentContext

  const build = (
    sources: VerifierTrustSource[],
    options: { legacyMdlCertificate?: string; serviceRoot?: string | null; refreshSeconds?: number } = {},
  ) => {
    const agent = createMock<Agent>({
      agencyConfig: {
        verifierTrustSources: sources,
        verifierTrustRefreshSeconds: options.refreshSeconds ?? 3600,
        mdlIssuerCertificate: options.legacyMdlCertificate ?? '',
      },
      genericRecords: {
        findAllByQuery: vi
          .fn()
          .mockResolvedValue([{ content: { certificateBase64: IACA_A } }, { content: { certificateBase64: IACA_B } }]),
      },
    } as unknown as Partial<Agent>)
    // Typed as the plain service (not DeepMocked) so `vi.mocked(...)` resolves the method signatures.
    const x509SignerService: X509SignerService = createMock<X509SignerService>()
    vi.mocked(x509SignerService.getServiceRootCertificate).mockResolvedValue(
      options.serviceRoot === null
        ? null
        : { certificateBase64: options.serviceRoot ?? SERVICE_ROOT, fingerprint: 'fp' },
    )
    const ingestion: EuTrustAnchorIngestionService = createMock<EuTrustAnchorIngestionService>()
    vi.mocked(ingestion.anchorsFromConfig).mockReturnValue([fakeCertificate(CONFIG_ANCHOR)])
    vi.mocked(ingestion.anchorsFromSource).mockImplementation((source) => {
      if (source === 'lotl') return Promise.resolve([fakeCertificate(LOTL_ANCHOR)])
      if (source === 'lote') return Promise.resolve([fakeCertificate(LOTE_ANCHOR)])
      return Promise.resolve([fakeCertificate(CONFIG_ANCHOR)])
    })
    const logger: Logger = createMock<Logger>()
    const service = new VerifierTrustAnchorService(agent, x509SignerService, ingestion, logger)
    return { service, agent, x509SignerService, ingestion, logger }
  }

  test('falls back to the global trusted certificates for non-credential verifications', async () => {
    const { service } = build(['registry', 'config', 'lotl', 'lote'])
    await expect(service.getTrustedCertificatesForVerification(agentContext, requestContext())).resolves.toBeUndefined()
  })

  test('mdoc: tenants IACAs from the registry + curated anchors + legacy fallback, never the service root', async () => {
    const { service, x509SignerService } = build(['registry', 'config'], { legacyMdlCertificate: LEGACY_MDL_CERT })
    const anchors = await service.getTrustedCertificatesForVerification(agentContext, mdocContext())
    expect(anchors).toEqual([IACA_A, IACA_B, LEGACY_MDL_CERT, CONFIG_ANCHOR])
    expect(x509SignerService.getServiceRootCertificate).not.toHaveBeenCalled()
  })

  test('SD-JWT VC / JWT chains: the service root + curated anchors, never the IACAs or the legacy mDL cert', async () => {
    const { service, agent } = build(['registry', 'config'], { legacyMdlCertificate: LEGACY_MDL_CERT })
    const anchors = await service.getTrustedCertificatesForVerification(agentContext, sdJwtContext())
    expect(anchors).toEqual([SERVICE_ROOT, CONFIG_ANCHOR])
    expect(agent.genericRecords.findAllByQuery).not.toHaveBeenCalled()
  })

  test('SD-JWT VC before any service root exists: only the curated anchors', async () => {
    const { service } = build(['registry', 'config'], { serviceRoot: null })
    await expect(service.getTrustedCertificatesForVerification(agentContext, sdJwtContext())).resolves.toEqual([
      CONFIG_ANCHOR,
    ])
  })

  test('source gating: without registry the tenant anchors are not consulted; without config the curated ones are not', async () => {
    const { service, agent, ingestion } = build(['config'])
    await expect(service.getTrustedCertificatesForVerification(agentContext, mdocContext())).resolves.toEqual([
      CONFIG_ANCHOR,
    ])
    expect(agent.genericRecords.findAllByQuery).not.toHaveBeenCalled()

    const registryOnly = build(['registry'])
    await expect(
      registryOnly.service.getTrustedCertificatesForVerification(agentContext, mdocContext()),
    ).resolves.toEqual([IACA_A, IACA_B])
    expect(registryOnly.ingestion.anchorsFromConfig).not.toHaveBeenCalled()
    expect(ingestion.anchorsFromSource).not.toHaveBeenCalled()
  })

  test('EU sources: loaded once on first use, then served from the snapshot', async () => {
    const { service, ingestion } = build(['registry', 'lotl', 'lote'])
    const first = await service.getTrustedCertificatesForVerification(agentContext, mdocContext())
    expect(first).toEqual([IACA_A, IACA_B, LOTL_ANCHOR, LOTE_ANCHOR])
    await service.getTrustedCertificatesForVerification(agentContext, sdJwtContext())
    // one lotl + one lote fetch in total — the second verification did not re-fetch
    expect(ingestion.anchorsFromSource).toHaveBeenCalledTimes(2)
  })

  test('EU refresh failure keeps the last good snapshot of that source and is logged', async () => {
    const { service, ingestion, logger } = build(['lotl', 'lote'])
    await service.refreshEuAnchors()
    vi.mocked(ingestion.anchorsFromSource).mockImplementation((source) =>
      source === 'lotl'
        ? Promise.reject(new Error('LoTL unreachable'))
        : Promise.resolve([fakeCertificate('LOTE-ANCHOR-2')]),
    )
    await service.refreshEuAnchors()
    const anchors = await service.getTrustedCertificatesForVerification(agentContext, mdocContext())
    expect(anchors).toEqual([LOTL_ANCHOR, 'LOTE-ANCHOR-2'])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ failed: [{ source: 'lotl', reason: 'LoTL unreachable' }] }),
      expect.stringContaining('1/2 EU source(s) failed'),
    )
  })

  test('a failing first load leaves the EU part empty but never throws into the verification', async () => {
    const { service, ingestion } = build(['registry', 'lotl'])
    vi.mocked(ingestion.anchorsFromSource).mockRejectedValue(new Error('offline'))
    await expect(service.getTrustedCertificatesForVerification(agentContext, mdocContext())).resolves.toEqual([
      IACA_A,
      IACA_B,
    ])
  })

  test('concurrent refreshes share one in-flight fetch', async () => {
    const { service, ingestion } = build(['lote'])
    await Promise.all([service.refreshEuAnchors(), service.refreshEuAnchors(), service.refreshEuAnchors()])
    expect(ingestion.anchorsFromSource).toHaveBeenCalledTimes(1)
  })
})
