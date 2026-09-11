import { webcrypto } from 'node:crypto'

import * as x509 from '@peculiar/x509'

import { ID_ETSI_QCT_PID_OID, ID_PE_QC_STATEMENTS_OID, MDL_DOCUMENT_SIGNER_EKU_OID } from '../certificate-profiles'
import {
  buildDistinguishedName,
  buildDscExtensions,
  buildIacaExtensions,
  type EcPublicJwk,
  encodeQcStatements,
  randomPositiveSerialNumberHex,
} from '../eu-certificate-builder'
import { assessEuSigningCertificate } from '../eu-certificate-profile-assessment'

/**
 * The executable TS 119 412-6 checklist: a DSC built by the EU builder passes it, and each single
 * deviation the reference wallet would reject is reported by name.
 */
const crypto = webcrypto as unknown as Crypto
x509.cryptoProvider.set(crypto)

const POLICY_OID = '1.3.6.1.4.1.99999.2'
const AIA_URL = 'https://heka.example/mdoc-issuers/certificates/abc'
const notBefore = new Date('2026-01-01T00:00:00Z')
const notAfter = new Date('2027-01-01T00:00:00Z')
const at = new Date('2026-06-01T00:00:00Z')

const generateP256 = async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = (await crypto.subtle.exportKey('jwk', keys.publicKey)) as EcPublicJwk
  return { keys, jwk }
}

const legalPersonDn = (commonName: string) =>
  buildDistinguishedName({
    countryName: 'DE',
    organizationName: 'Heka',
    organizationIdentifier: 'VATDE-0123456789',
    commonName,
  })

describe('assessEuSigningCertificate', () => {
  let issuer: { keys: CryptoKeyPair; jwk: EcPublicJwk }

  beforeAll(async () => {
    issuer = await generateP256()
  })

  /** A CA-issued DSC with the given extension overrides (defaults = the conformant PID DSC). */
  async function dsc(
    overrides: {
      extensions?: (subjectJwk: EcPublicJwk) => x509.Extension[]
      subject?: x509.Name
      serialNumber?: string
      validity?: { notBefore: Date; notAfter: Date }
    } = {},
  ) {
    const subject = await generateP256()
    const extensions =
      overrides.extensions?.(subject.jwk) ??
      buildDscExtensions({
        subjectJwk: subject.jwk,
        authorityJwk: issuer.jwk,
        certificatePolicyOids: [POLICY_OID],
        qcTypes: [ID_ETSI_QCT_PID_OID],
        authorityInfoAccessCaIssuers: AIA_URL,
      })
    return x509.X509CertificateGenerator.create(
      {
        signingKey: issuer.keys.privateKey,
        publicKey: subject.keys.publicKey,
        issuer: legalPersonDn('Heka PID IACA'),
        subject: overrides.subject ?? legalPersonDn('Heka PID DSC'),
        notBefore: overrides.validity?.notBefore ?? notBefore,
        notAfter: overrides.validity?.notAfter ?? notAfter,
        serialNumber: overrides.serialNumber ?? randomPositiveSerialNumberHex(),
        extensions,
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
      },
      crypto,
    )
  }

  const violationsOf = (certificate: x509.X509Certificate, requiredQcType?: string) =>
    assessEuSigningCertificate(certificate, { at, requiredQcType }).violations

  test('the EU builder output meets every PID Provider requirement', async () => {
    const certificate = await dsc()
    expect(assessEuSigningCertificate(certificate, { at, requiredQcType: ID_ETSI_QCT_PID_OID })).toEqual({
      met: true,
      violations: [],
    })
  })

  test('an EAA certificate (no QcType) is conformant when no QcType is required', async () => {
    const certificate = await dsc({
      extensions: (subjectJwk) =>
        buildDscExtensions({
          subjectJwk,
          authorityJwk: issuer.jwk,
          certificatePolicyOids: [POLICY_OID],
          authorityInfoAccessCaIssuers: AIA_URL,
        }),
    })
    expect(violationsOf(certificate)).toEqual([])
    expect(violationsOf(certificate, ID_ETSI_QCT_PID_OID)).toEqual([
      expect.stringContaining('QcType 0.4.0.194126.1.1 is missing (PID-4.5-01)'),
    ])
  })

  test('reports a missing certificatePolicies extension', async () => {
    const certificate = await dsc({
      extensions: (subjectJwk) =>
        buildDscExtensions({
          subjectJwk,
          authorityJwk: issuer.jwk,
          qcTypes: [ID_ETSI_QCT_PID_OID],
          authorityInfoAccessCaIssuers: AIA_URL,
        }),
    })
    expect(violationsOf(certificate, ID_ETSI_QCT_PID_OID)).toEqual([
      expect.stringContaining('certificatePolicies extension is missing'),
    ])
  })

  test('reports a CA-issued certificate without an http(s) AIA caIssuers location', async () => {
    const missing = await dsc({
      extensions: (subjectJwk) =>
        buildDscExtensions({ subjectJwk, authorityJwk: issuer.jwk, certificatePolicyOids: [POLICY_OID] }),
    })
    expect(violationsOf(missing)).toEqual([expect.stringContaining('authorityInformationAccess extension is missing')])

    const ldap = await dsc({
      extensions: (subjectJwk) =>
        buildDscExtensions({
          subjectJwk,
          authorityJwk: issuer.jwk,
          certificatePolicyOids: [POLICY_OID],
          authorityInfoAccessCaIssuers: 'ldap://directory.example/ca',
        }),
    })
    expect(violationsOf(ldap)).toEqual([expect.stringContaining('http or https scheme (PID-4.4.3-03)')])
  })

  test('reports a critical extension other than keyUsage / basicConstraints (PID-4.1-02)', async () => {
    const certificate = await dsc({
      extensions: (subjectJwk) =>
        buildDscExtensions({
          subjectJwk,
          authorityJwk: issuer.jwk,
          certificatePolicyOids: [POLICY_OID],
          authorityInfoAccessCaIssuers: AIA_URL,
          extendedKeyUsage: { oids: [MDL_DOCUMENT_SIGNER_EKU_OID], critical: true },
        }),
    })
    expect(violationsOf(certificate)).toEqual([expect.stringContaining('2.5.29.37 must not be critical')])
  })

  test('reports a legal-person subject without organizationIdentifier', async () => {
    const certificate = await dsc({
      subject: buildDistinguishedName({ countryName: 'DE', organizationName: 'Heka', commonName: 'Heka PID DSC' }),
    })
    expect(violationsOf(certificate)).toEqual([
      expect.stringContaining('subject: organizationIdentifier (2.5.4.97) is missing'),
    ])
  })

  test('reports a certificate outside its validity window and a non-positive serial', async () => {
    const expired = await dsc({ validity: { notBefore, notAfter: new Date('2026-02-01T00:00:00Z') } })
    expect(violationsOf(expired)).toEqual([expect.stringContaining('not valid at')])

    const negative = await dsc({ serialNumber: 'ff01' })
    expect(violationsOf(negative)).toEqual([expect.stringContaining('serialNumber must be a positive integer')])
  })

  test('a CA certificate is not an end-entity sign/seal certificate', async () => {
    const certificate = await dsc({ extensions: (subjectJwk) => buildIacaExtensions({ subjectJwk }) })
    const violations = violationsOf(certificate)
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('marks the certificate as a CA'),
        expect.stringContaining('does not contain digitalSignature'),
      ]),
    )
  })

  test('qcStatements round-trips through the encoder (DER SEQUENCE OF QCStatement)', async () => {
    const der = encodeQcStatements([ID_ETSI_QCT_PID_OID])
    const certificate = await dsc({
      extensions: (subjectJwk) =>
        buildDscExtensions({
          subjectJwk,
          authorityJwk: issuer.jwk,
          certificatePolicyOids: [POLICY_OID],
          qcTypes: [ID_ETSI_QCT_PID_OID],
          authorityInfoAccessCaIssuers: AIA_URL,
        }),
    })
    const extension = certificate.getExtension(ID_PE_QC_STATEMENTS_OID)
    expect(extension?.critical).toBe(false)
    expect(Buffer.from(extension!.value).equals(Buffer.from(der))).toBe(true)
  })
})
