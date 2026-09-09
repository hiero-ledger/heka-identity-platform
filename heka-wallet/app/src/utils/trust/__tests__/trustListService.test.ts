jest.mock('@credo-ts/core', () => ({
  X509Certificate: {
    fromEncodedCertificate: jest.fn(() => ({
      publicJwk: { toJson: () => ({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }) },
    })),
  },
}))

import { issuerTrustStore } from '../issuerTrustStore'
import { refreshIssuerTrustList, TrustListAgent } from '../trustListService'

// Standard-CBOR VICAL fixture (cbor-x, no tag 259) listing one IACA — same bytes as the parser test.
const COSE_BASE64 =
  '0oRDoQEmoRghgkUwggEQqkUwggIgu1jlpmd2ZXJzaW9uYzEuMG12aWNhbFByb3ZpZGVyZEhla2FkZGF0ZcEaakBkAGpuZXh0VXBkYXRlwRpqSZ6AbHZpY2FsSXNzdWVJRANwY2VydGlmaWNhdGVJbmZvc4Gna2NlcnRpZmljYXRlRjCCAzDM3WxzZXJpYWxOdW1iZXIbEjRWeJCrze9jc2tpRKq7zN1nZG9jVHlwZYF1b3JnLmlzby4xODAxMy41LjEubURMcGlzc3VpbmdBdXRob3JpdHlkSGVrYW5pc3N1aW5nQ291bnRyeWJVU2hub3RBZnRlcsEacr0MAFhAQ3I5q1rScYNqb5HapylVHTUAwNviPalMQKSUZfhARnJ3rwflGnNZlp4l2l/QD/mIOMgQcrSMcTqBRPbXMVRPTA=='
const IACA_BASE64 = 'MIIDMMzd'
const ROOT = ['MIICILs=']

function fixtureResponse(): Response {
  const bytes = Buffer.from(COSE_BASE64, 'base64')
  return {
    ok: true,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response
}

function buildAgent(overrides: Partial<{ validate: jest.Mock; verify: jest.Mock }> = {}): TrustListAgent {
  return {
    x509: { validateCertificateChain: overrides.validate ?? jest.fn().mockResolvedValue([]) },
    kms: { verify: overrides.verify ?? jest.fn().mockResolvedValue({ verified: true }) },
  }
}

describe('refreshIssuerTrustList', () => {
  beforeEach(() => issuerTrustStore.clear())

  test('verifies the VICAL and trusts the listed IACAs', async () => {
    const validate = jest.fn().mockResolvedValue([])
    const verify = jest.fn().mockResolvedValue({ verified: true })
    const agent = buildAgent({ validate, verify })

    const result = await refreshIssuerTrustList(agent, {
      vicalUrl: 'https://heka.example/vical',
      trustedRootCertificates: ROOT,
      fetchImpl: async () => fixtureResponse(),
    })

    expect(result).toMatchObject({ ok: true, issuerCount: 1, vicalIssueID: 3 })
    expect(issuerTrustStore.getIssuerCertificates()).toEqual([IACA_BASE64])

    // chain validated against the bundled root; signature verified via ES256 over a Uint8Array
    expect(validate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateChain: ['MIIBEKo=', 'MIICILs='], trustedCertificates: ROOT }),
    )
    const verifyArgs = verify.mock.calls[0][0]
    expect(verifyArgs.algorithm).toBe('ES256')
    expect(verifyArgs.signature).toHaveLength(64)
    expect(verifyArgs.data).toBeInstanceOf(Uint8Array)
  })

  test('returns no-vical-url when the URL is missing', async () => {
    const result = await refreshIssuerTrustList(buildAgent(), { trustedRootCertificates: ROOT })
    expect(result).toEqual({ ok: false, reason: 'no-vical-url' })
  })

  test('returns no-trusted-root when no root is bundled', async () => {
    const result = await refreshIssuerTrustList(buildAgent(), {
      vicalUrl: 'https://heka.example/vical',
      trustedRootCertificates: [],
    })
    expect(result).toEqual({ ok: false, reason: 'no-trusted-root' })
  })

  test('surfaces an HTTP error and leaves trust untouched', async () => {
    issuerTrustStore.setIssuerCertificates('vical', ['PRESERVED'])
    const result = await refreshIssuerTrustList(buildAgent(), {
      vicalUrl: 'https://heka.example/vical',
      trustedRootCertificates: ROOT,
      fetchImpl: async () => ({ ok: false, status: 404 }) as unknown as Response,
    })
    expect(result).toEqual({ ok: false, reason: 'http-404' })
    expect(issuerTrustStore.getIssuerCertificates()).toEqual(['PRESERVED'])
  })

  test('rejects a bad COSE signature and leaves trust untouched', async () => {
    issuerTrustStore.setIssuerCertificates('vical', ['PRESERVED'])
    const result = await refreshIssuerTrustList(buildAgent({ verify: jest.fn().mockResolvedValue({ verified: false }) }), {
      vicalUrl: 'https://heka.example/vical',
      trustedRootCertificates: ROOT,
      fetchImpl: async () => fixtureResponse(),
    })
    expect(result).toEqual({ ok: false, reason: 'invalid-signature' })
    expect(issuerTrustStore.getIssuerCertificates()).toEqual(['PRESERVED'])
  })

  test('surfaces a chain-validation failure and leaves trust untouched', async () => {
    issuerTrustStore.setIssuerCertificates('vical', ['PRESERVED'])
    const validate = jest.fn().mockRejectedValue(new Error('untrusted chain'))
    const result = await refreshIssuerTrustList(buildAgent({ validate }), {
      vicalUrl: 'https://heka.example/vical',
      trustedRootCertificates: ROOT,
      fetchImpl: async () => fixtureResponse(),
    })
    expect(result).toEqual({ ok: false, reason: 'untrusted chain' })
    expect(issuerTrustStore.getIssuerCertificates()).toEqual(['PRESERVED'])
  })
})
