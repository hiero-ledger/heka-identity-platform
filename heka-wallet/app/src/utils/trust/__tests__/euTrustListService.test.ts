jest.mock('@credo-ts/core', () => ({
  X509Certificate: {
    fromEncodedCertificate: jest.fn(() => ({
      publicJwk: { toJson: () => ({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }) },
    })),
  },
}))

import { EuTrustListAgent, refreshEuTrustList } from '../euTrustListService'
import { issuerTrustStore } from '../issuerTrustStore'

const EU_ANCHOR = 'MIID_EU_ANCHOR'
const GRANTED = 'http://uri.etsi.org/TrstSvc/Svcstatus/granted'

const b64url = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString('base64url')

/** A minimal TS 119 602 LoTE payload listing the given anchors as granted services. */
const lotePayload = (anchors: Array<{ certificate: string; status?: string }>) => ({
  LoTE: {
    ListAndSchemeInformation: { SchemeOperatorName: [{ lang: 'en', value: 'Heka' }] },
    TrustedEntitiesList: anchors.map((anchor) => ({
      TrustedEntityServices: [
        {
          ServiceInformation: {
            ServiceStatus: anchor.status ?? GRANTED,
            ServiceDigitalIdentity: { X509Certificates: [{ val: anchor.certificate }] },
          },
        },
      ],
    })),
  },
})

function buildJws(
  overrides: { typ?: string; x5c?: unknown; anchors?: Array<{ certificate: string; status?: string }> } = {},
): string {
  const header = { alg: 'ES256', typ: overrides.typ ?? 'trustlist+jwt', x5c: overrides.x5c ?? ['LEAF', 'ROOT'] }
  const payload = lotePayload(overrides.anchors ?? [{ certificate: EU_ANCHOR }])
  return `${b64url(header)}.${b64url(payload)}.${Buffer.from('sig').toString('base64url')}`
}

const jwsResponse = (jws: string): Response => ({ ok: true, text: async () => jws }) as unknown as Response

function buildAgent(overrides: Partial<{ validate: jest.Mock; verify: jest.Mock }> = {}): EuTrustListAgent {
  return {
    x509: { validateCertificateChain: overrides.validate ?? jest.fn().mockResolvedValue([]) },
    kms: { verify: overrides.verify ?? jest.fn().mockResolvedValue({ verified: true }) },
  }
}

const URL = 'https://heka.example/eu-trust-list'
const ROOT = ['ROOT']

describe('refreshEuTrustList', () => {
  beforeEach(() => issuerTrustStore.clear())

  test('verifies the JWS and trusts the listed EU anchors', async () => {
    const validate = jest.fn().mockResolvedValue([])
    const verify = jest.fn().mockResolvedValue({ verified: true })

    const result = await refreshEuTrustList(buildAgent({ validate, verify }), {
      euTrustListUrl: URL,
      trustedRootCertificates: ROOT,
      fetchImpl: async () => jwsResponse(buildJws()),
    })

    expect(result).toMatchObject({ ok: true, issuerCount: 1 })
    expect(issuerTrustStore.getIssuerCertificates()).toEqual([EU_ANCHOR])

    // signer x5c chain validated against the bundled root; ES256 over a Uint8Array signing input
    expect(validate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateChain: ['LEAF', 'ROOT'], trustedCertificates: ROOT }),
    )
    const verifyArgs = verify.mock.calls[0][0]
    expect(verifyArgs.algorithm).toBe('ES256')
    expect(verifyArgs.data).toBeInstanceOf(Uint8Array)
    expect(verifyArgs.signature).toBeInstanceOf(Uint8Array)
  })

  test('unions EU anchors with VICAL-learned anchors (source-keyed, no clobber)', async () => {
    issuerTrustStore.setIssuerCertificates('vical', ['IACA'])
    await refreshEuTrustList(buildAgent(), {
      euTrustListUrl: URL,
      trustedRootCertificates: ROOT,
      fetchImpl: async () => jwsResponse(buildJws()),
    })
    expect(issuerTrustStore.getIssuerCertificates()).toEqual(['IACA', EU_ANCHOR])
  })

  test('excludes anchors whose service status is not granted', async () => {
    const jws = buildJws({
      anchors: [
        { certificate: EU_ANCHOR },
        { certificate: 'MIID_WITHDRAWN', status: 'http://uri.etsi.org/TrstSvc/Svcstatus/withdrawn' },
      ],
    })
    const result = await refreshEuTrustList(buildAgent(), {
      euTrustListUrl: URL,
      trustedRootCertificates: ROOT,
      fetchImpl: async () => jwsResponse(jws),
    })
    expect(result).toMatchObject({ ok: true, issuerCount: 1 })
    expect(issuerTrustStore.getIssuerCertificates()).toEqual([EU_ANCHOR])
  })

  test('returns no-eu-trust-list-url when the URL is missing', async () => {
    const result = await refreshEuTrustList(buildAgent(), { trustedRootCertificates: ROOT })
    expect(result).toEqual({ ok: false, reason: 'no-eu-trust-list-url' })
  })

  test('returns no-trusted-root when no root is bundled', async () => {
    const result = await refreshEuTrustList(buildAgent(), { euTrustListUrl: URL, trustedRootCertificates: [] })
    expect(result).toEqual({ ok: false, reason: 'no-trusted-root' })
  })

  test('surfaces an HTTP error and leaves trust untouched', async () => {
    issuerTrustStore.setIssuerCertificates('eu', ['PRESERVED'])
    const result = await refreshEuTrustList(buildAgent(), {
      euTrustListUrl: URL,
      trustedRootCertificates: ROOT,
      fetchImpl: async () => ({ ok: false, status: 404 }) as unknown as Response,
    })
    expect(result).toEqual({ ok: false, reason: 'http-404' })
    expect(issuerTrustStore.getIssuerCertificates()).toEqual(['PRESERVED'])
  })

  test('rejects an unexpected JWS typ', async () => {
    const result = await refreshEuTrustList(buildAgent(), {
      euTrustListUrl: URL,
      trustedRootCertificates: ROOT,
      fetchImpl: async () => jwsResponse(buildJws({ typ: 'something-else' })),
    })
    expect(result).toEqual({ ok: false, reason: 'unexpected-typ' })
  })

  test('rejects a malformed (non-3-part) JWS', async () => {
    const result = await refreshEuTrustList(buildAgent(), {
      euTrustListUrl: URL,
      trustedRootCertificates: ROOT,
      fetchImpl: async () => jwsResponse('not.a-jws'),
    })
    expect(result).toEqual({ ok: false, reason: 'malformed-jws' })
  })

  test('rejects a bad JWS signature and leaves trust untouched', async () => {
    issuerTrustStore.setIssuerCertificates('eu', ['PRESERVED'])
    const result = await refreshEuTrustList(buildAgent({ verify: jest.fn().mockResolvedValue({ verified: false }) }), {
      euTrustListUrl: URL,
      trustedRootCertificates: ROOT,
      fetchImpl: async () => jwsResponse(buildJws()),
    })
    expect(result).toEqual({ ok: false, reason: 'invalid-signature' })
    expect(issuerTrustStore.getIssuerCertificates()).toEqual(['PRESERVED'])
  })

  test('surfaces a chain-validation failure and leaves trust untouched', async () => {
    issuerTrustStore.setIssuerCertificates('eu', ['PRESERVED'])
    const validate = jest.fn().mockRejectedValue(new Error('untrusted chain'))
    const result = await refreshEuTrustList(buildAgent({ validate }), {
      euTrustListUrl: URL,
      trustedRootCertificates: ROOT,
      fetchImpl: async () => jwsResponse(buildJws()),
    })
    expect(result).toEqual({ ok: false, reason: 'untrusted chain' })
    expect(issuerTrustStore.getIssuerCertificates()).toEqual(['PRESERVED'])
  })
})
