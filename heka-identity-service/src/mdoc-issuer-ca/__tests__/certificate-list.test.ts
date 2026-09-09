import { webcrypto } from 'node:crypto'

import * as x509 from '@peculiar/x509'

import { parseConfiguredAnchors, parseSignerCertificates } from '../certificate-list'

const crypto = webcrypto as unknown as Crypto
x509.cryptoProvider.set(crypto)

const generateCertB64 = async (commonName: string): Promise<string> => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const cert = await x509.X509CertificateGenerator.createSelfSigned(
    {
      keys,
      name: `CN=${commonName}`,
      notBefore: new Date('2026-01-01T00:00:00Z'),
      notAfter: new Date('2031-01-01T00:00:00Z'),
      extensions: [],
    },
    crypto,
  )
  return Buffer.from(cert.rawData).toString('base64')
}

describe('parseConfiguredAnchors', () => {
  let certB64: string
  beforeAll(async () => {
    certB64 = await generateCertB64('EU PID Issuer CA')
  })

  test('empty / blank config yields no anchors', () => {
    expect(parseConfiguredAnchors('')).toEqual([])
    expect(parseConfiguredAnchors('   \n  ')).toEqual([])
  })

  test('parses a single base64 DER certificate', () => {
    expect(parseConfiguredAnchors(certB64)).toHaveLength(1)
  })

  test('parses multiple comma/whitespace-separated base64 certificates', async () => {
    const second = await generateCertB64('EU EAA Issuer CA')
    expect(parseConfiguredAnchors(`${certB64} , ${second}`)).toHaveLength(2)
    expect(parseConfiguredAnchors(`${certB64}\n${second}`)).toHaveLength(2)
  })

  test('parses PEM certificate blocks', () => {
    const pem = `-----BEGIN CERTIFICATE-----\n${certB64}\n-----END CERTIFICATE-----`
    expect(parseConfiguredAnchors(pem)).toHaveLength(1)
  })
})

describe('parseSignerCertificates', () => {
  test('parses base64, PEM, and empty', () => {
    expect(parseSignerCertificates('')).toEqual([])
    expect(parseSignerCertificates('MIIBcert')).toEqual(['MIIBcert'])
    expect(parseSignerCertificates('-----BEGIN CERTIFICATE-----\nMIIB\ncert\n-----END CERTIFICATE-----')).toEqual([
      'MIIBcert',
    ])
  })
})
