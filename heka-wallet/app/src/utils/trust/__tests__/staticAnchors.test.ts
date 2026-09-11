import { parseCertificateList, staticAnchorsFromConfig } from '../staticAnchors'

const CERT_A = 'MIIBwDCCAWWgAwIBAgIUSMdjaVc1KHI+3o6qJXhSC4sJh+c='
const CERT_B = 'MIIBxTCCAWugAwIBAgIUb2/0Zm9vYmFy'

describe('parseCertificateList', () => {
  test('unset or blank means no anchors', () => {
    expect(parseCertificateList(undefined, 'X')).toEqual([])
    expect(parseCertificateList('', 'X')).toEqual([])
    expect(parseCertificateList('  \n ', 'X')).toEqual([])
  })

  test('splits on commas and strips whitespace around and inside entries', () => {
    expect(parseCertificateList(` ${CERT_A} ,\n${CERT_B.slice(0, 10)} ${CERT_B.slice(10)}\n, `, 'X')).toEqual([
      CERT_A,
      CERT_B,
    ])
  })

  test('accepts PEM blocks, stripping the armour and line breaks', () => {
    const pem = `-----BEGIN CERTIFICATE-----\n${CERT_A.slice(0, 20)}\n${CERT_A.slice(20)}\n-----END CERTIFICATE-----\n`
    expect(parseCertificateList(`${pem},${CERT_B}`, 'X')).toEqual([CERT_A, CERT_B])
  })

  test('drops duplicate entries', () => {
    expect(parseCertificateList(`${CERT_A},${CERT_A},${CERT_B}`, 'X')).toEqual([CERT_A, CERT_B])
  })

  test('rejects an entry that is not base64, naming the variable and position', () => {
    expect(() =>
      parseCertificateList(`${CERT_A},<paste certificate here>`, 'TRUSTED_MDOC_ISSUER_CERTIFICATES')
    ).toThrow('TRUSTED_MDOC_ISSUER_CERTIFICATES[1] is not a base64 DER (or PEM) certificate')
  })
})

describe('staticAnchorsFromConfig', () => {
  test('both sets are empty by default — nothing is bundled', () => {
    expect(staticAnchorsFromConfig({})).toEqual({ mdocIssuers: [], requestSigners: [] })
  })

  test('maps each variable to its own trust domain', () => {
    expect(
      staticAnchorsFromConfig({
        TRUSTED_MDOC_ISSUER_CERTIFICATES: CERT_A,
        TRUSTED_REQUEST_SIGNER_CERTIFICATES: `${CERT_B},${CERT_A}`,
      })
    ).toEqual({ mdocIssuers: [CERT_A], requestSigners: [CERT_B, CERT_A] })
  })
})
