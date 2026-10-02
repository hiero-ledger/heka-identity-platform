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

import { validateCertificate, validateCertificateList } from '../certificateConfig'

const CERT_A = 'MIIBwDCCAWWgAwIBAgIUSMdjaVc1KHI+3o6qJXhSC4sJh+c='
const CERT_B = 'MIIBxTCCAWugAwIBAgIUb2/0Zm9vYmFy'

describe('validateCertificateList', () => {
  test('unset or blank means no anchors', () => {
    expect(validateCertificateList(undefined, 'X')).toEqual([])
    expect(validateCertificateList('', 'X')).toEqual([])
    expect(validateCertificateList('  \n ', 'X')).toEqual([])
  })

  test('splits on commas and strips whitespace around and inside entries', () => {
    expect(validateCertificateList(` ${CERT_A} ,\n${CERT_B.slice(0, 10)} ${CERT_B.slice(10)}\n, `, 'X')).toEqual([
      CERT_A,
      CERT_B,
    ])
  })

  test('accepts PEM blocks, stripping the armour and line breaks', () => {
    const pem = `-----BEGIN CERTIFICATE-----\n${CERT_A.slice(0, 20)}\n${CERT_A.slice(20)}\n-----END CERTIFICATE-----\n`
    expect(validateCertificateList(`${pem},${CERT_B}`, 'X')).toEqual([CERT_A, CERT_B])
  })

  test('drops duplicate entries', () => {
    expect(validateCertificateList(`${CERT_A},${CERT_A},${CERT_B}`, 'X')).toEqual([CERT_A, CERT_B])
  })

  test('rejects an entry that is not base64, naming the variable and position', () => {
    expect(() =>
      validateCertificateList(`${CERT_A},<paste certificate here>`, 'TRUSTED_MDOC_ISSUER_CERTIFICATES')
    ).toThrow('TRUSTED_MDOC_ISSUER_CERTIFICATES[1] is not a base64 DER (or PEM) certificate')
  })
})

describe('validateCertificateList — every entry must decode as an X.509 certificate', () => {
  test('rejects a base64 entry that is not a certificate, naming the variable and position', () => {
    expect(() => validateCertificateList(`${CERT_A},MIIBINVALID`, 'TRUSTED_REQUEST_SIGNER_CERTIFICATES')).toThrow(
      'TRUSTED_REQUEST_SIGNER_CERTIFICATES[1] is not a valid X.509 certificate: ASN.1 parse error'
    )
  })

  test('validateCertificate accepts exactly one certificate (PEM or base64) and rejects zero or several', () => {
    expect(validateCertificate(`-----BEGIN CERTIFICATE-----\n${CERT_A}\n-----END CERTIFICATE-----`, 'ROOT')).toBe(CERT_A)
    expect(() => validateCertificate('', 'ROOT')).toThrow('ROOT must hold exactly one certificate (found 0)')
    expect(() => validateCertificate(`${CERT_A},${CERT_B}`, 'ROOT')).toThrow(
      'ROOT must hold exactly one certificate (found 2)'
    )
  })
})
