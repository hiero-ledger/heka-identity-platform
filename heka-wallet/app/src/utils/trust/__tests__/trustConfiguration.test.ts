jest.mock('@credo-ts/core', () => ({
  X509Certificate: {
    // The wallet test environment has no WebCrypto for real DER parsing; the parser is exercised by
    // its failure mode — any entry containing INVALID is "not a certificate".
    fromEncodedCertificate: jest.fn((certificate: string) => {
      if (certificate.includes('INVALID')) throw new Error('ASN.1 parse error')
      return {}
    }),
  },
}))

import { loadTrustConfiguration } from '../trustConfiguration'
import { HEKA_EAA_PROVIDERS_SOURCE_ID, HEKA_WRPAC_PROVIDERS_SOURCE_ID } from '../trustSources'

const ROOT = 'MIIDROOT'
const IACA = 'MIIDIACA'
const LEAF = 'MIIDLEAF'

describe('loadTrustConfiguration', () => {
  test('a valid configuration yields the static sets, the service root and the pinned default sources', () => {
    const log = jest.fn()
    const configuration = loadTrustConfiguration(
      {
        AGENCY_PROVIDER_URL: 'https://heka.example',
        HEKA_SERVICE_ROOT_CERTIFICATE: ROOT,
        TRUSTED_MDOC_ISSUER_CERTIFICATES: IACA,
        TRUSTED_REQUEST_SIGNER_CERTIFICATES: LEAF,
      },
      log
    )
    expect(configuration).toEqual({
      staticAnchors: { mdocIssuers: [IACA], requestSigners: [LEAF] },
      serviceRoots: [ROOT],
      sources: [
        expect.objectContaining({ id: HEKA_EAA_PROVIDERS_SOURCE_ID, pinnedSigners: [ROOT] }),
        expect.objectContaining({ id: HEKA_WRPAC_PROVIDERS_SOURCE_ID, pinnedSigners: [ROOT] }),
      ],
      errors: [],
    })
    expect(log).not.toHaveBeenCalled()
  })

  test('everything unset: empty sets, no root, no sources, no errors', () => {
    expect(loadTrustConfiguration({})).toEqual({
      staticAnchors: { mdocIssuers: [], requestSigners: [] },
      serviceRoots: [],
      sources: [],
      errors: [],
    })
  })

  test('M8: an invalid static anchor is logged and contributes nothing — the other settings still load', () => {
    const log = jest.fn()
    const configuration = loadTrustConfiguration(
      {
        AGENCY_PROVIDER_URL: 'https://heka.example',
        HEKA_SERVICE_ROOT_CERTIFICATE: ROOT,
        TRUSTED_MDOC_ISSUER_CERTIFICATES: 'MIIDINVALID',
        TRUSTED_REQUEST_SIGNER_CERTIFICATES: LEAF,
      },
      log
    )
    expect(configuration.staticAnchors).toEqual({ mdocIssuers: [], requestSigners: [LEAF] })
    expect(configuration.serviceRoots).toEqual([ROOT])
    expect(configuration.sources).toHaveLength(2)
    expect(configuration.errors).toEqual([
      'TRUSTED_MDOC_ISSUER_CERTIFICATES[0] is not a valid X.509 certificate: ASN.1 parse error',
    ])
    expect(log).toHaveBeenCalledWith(
      'Trust configuration error — TRUSTED_MDOC_ISSUER_CERTIFICATES[0] is not a valid X.509 certificate: ASN.1 parse error'
    )
  })

  test('M8: an invalid service root leaves the default sources unpinned (their refresh is skipped) instead of crashing', () => {
    const configuration = loadTrustConfiguration({
      AGENCY_PROVIDER_URL: 'https://heka.example',
      HEKA_SERVICE_ROOT_CERTIFICATE: '<paste root here>',
    })
    expect(configuration.serviceRoots).toEqual([])
    expect(configuration.sources.map((source) => source.pinnedSigners)).toEqual([[], []])
    expect(configuration.errors).toEqual(['HEKA_SERVICE_ROOT_CERTIFICATE is not a base64 DER (or PEM) certificate'])
  })

  test('M8: invalid TRUST_SOURCES yields no sources at all (never a silent fallback to the defaults)', () => {
    const configuration = loadTrustConfiguration({
      AGENCY_PROVIDER_URL: 'https://heka.example',
      HEKA_SERVICE_ROOT_CERTIFICATE: ROOT,
      TRUST_SOURCES: '[{"id":"x"}]',
    })
    expect(configuration.sources).toEqual([])
    expect(configuration.serviceRoots).toEqual([ROOT])
    expect(configuration.errors).toEqual(['TRUST_SOURCES[0].role: must be one of credential-issuer, access-certificate'])
  })
})
