import { webcrypto } from 'node:crypto'

import * as x509 from '@peculiar/x509'

import { ORGANIZATION_IDENTIFIER_OID } from '../certificate-profiles'
import {
  buildDistinguishedName,
  buildDscExtensions,
  buildIacaExtensions,
  ecKeyIdentifierHex,
  type EcPublicJwk,
} from '../eu-certificate-builder'

/**
 * Proves the `@peculiar/x509` escape hatch produces valid EU/EUDI-profile certificates — the extensions
 * and DN attributes Credo's `X509Api` cannot emit (`organizationIdentifier`, `certificatePolicies`,
 * arbitrary EKU OIDs). Uses **native** WebCrypto keys (no KMS): this isolates the novel cert-content logic
 * (the pure builders) from the KMS signing wiring, which mirrors Credo's own verified path.
 */
const crypto = webcrypto as unknown as Crypto
x509.cryptoProvider.set(crypto)

// Clearly-fake test OIDs — NOT the normative ETSI values (which are still stabilizing; see the profile notes).
const TEST_EKU_OID = '1.3.6.1.4.1.99999.1'
const TEST_POLICY_OID = '1.3.6.1.4.1.99999.2'
const ORG_ID = 'VATDE-0123456789'

const generateP256 = async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = (await crypto.subtle.exportKey('jwk', keys.publicKey)) as EcPublicJwk
  return { keys, jwk }
}

const validity = () => ({ notBefore: new Date('2026-01-01T00:00:00Z'), notAfter: new Date('2031-01-01T00:00:00Z') })

describe('eu-certificate-builder — pure helpers', () => {
  test('ecKeyIdentifierHex returns a 40-char (SHA-1) hex derived from the EC point', async () => {
    const { jwk } = await generateP256()
    const kid = ecKeyIdentifierHex(jwk)
    expect(kid).toMatch(/^[0-9a-f]{40}$/)
    // deterministic for the same key
    expect(ecKeyIdentifierHex(jwk)).toBe(kid)
  })

  test('buildDistinguishedName encodes organizationIdentifier (2.5.4.97) retrievable by OID', () => {
    const name = buildDistinguishedName({
      commonName: 'Heka PID IACA',
      countryName: 'DE',
      organizationName: 'Heka',
      organizationIdentifier: ORG_ID,
    })
    expect(name.getField(ORGANIZATION_IDENTIFIER_OID)).toContain(ORG_ID)
    expect(name.getField('CN')).toContain('Heka PID IACA')
    expect(name.getField('C')).toContain('DE')
  })

  test('buildDscExtensions omits EKU/policies when not supplied, emits them when supplied', async () => {
    const { jwk: subjectJwk } = await generateP256()
    const { jwk: authorityJwk } = await generateP256()

    const bare = buildDscExtensions({ subjectJwk, authorityJwk })
    expect(bare.some((e) => e instanceof x509.ExtendedKeyUsageExtension)).toBe(false)
    expect(bare.some((e) => e instanceof x509.CertificatePolicyExtension)).toBe(false)

    const full = buildDscExtensions({
      subjectJwk,
      authorityJwk,
      extendedKeyUsageOids: [TEST_EKU_OID],
      certificatePolicyOids: [TEST_POLICY_OID],
    })
    expect(full.some((e) => e instanceof x509.ExtendedKeyUsageExtension)).toBe(true)
    expect(full.some((e) => e instanceof x509.CertificatePolicyExtension)).toBe(true)
  })
})

describe('eu-certificate-builder — generated IACA→DSC chain (peculiar-native signing)', () => {
  test('IACA is a self-signed CA carrying organizationIdentifier; its SKI matches the pure helper', async () => {
    const { keys, jwk } = await generateP256()
    const dn = {
      commonName: 'Heka PID IACA',
      countryName: 'DE',
      organizationName: 'Heka',
      organizationIdentifier: ORG_ID,
    }

    const iaca = await x509.X509CertificateGenerator.createSelfSigned(
      { keys, name: buildDistinguishedName(dn), ...validity(), extensions: buildIacaExtensions({ subjectJwk: jwk }) },
      crypto,
    )

    expect(iaca.subjectName.getField(ORGANIZATION_IDENTIFIER_OID)).toContain(ORG_ID)
    // CA + SKI present and correct
    const bc = iaca.getExtension(x509.BasicConstraintsExtension)
    expect(bc?.ca).toBe(true)
    const ski = iaca.getExtension(x509.SubjectKeyIdentifierExtension)
    expect(ski?.keyId).toBe(ecKeyIdentifierHex(jwk))
    // self-signed signature verifies
    expect(await iaca.verify({ publicKey: keys.publicKey, signatureOnly: true }, crypto)).toBe(true)
  })

  test('DSC carries EKU + certificatePolicies, chains to the IACA (AKI==SKI), and its signature verifies', async () => {
    const iaca = await generateP256()
    const dsc = await generateP256()
    const dn = { countryName: 'DE', organizationName: 'Heka', organizationIdentifier: ORG_ID }

    const iacaCert = await x509.X509CertificateGenerator.createSelfSigned(
      {
        keys: iaca.keys,
        name: buildDistinguishedName({ ...dn, commonName: 'Heka PID IACA' }),
        ...validity(),
        extensions: buildIacaExtensions({ subjectJwk: iaca.jwk }),
      },
      crypto,
    )

    const dscCert = await x509.X509CertificateGenerator.create(
      {
        signingKey: iaca.keys.privateKey,
        publicKey: dsc.keys.publicKey,
        issuer: buildDistinguishedName({ ...dn, commonName: 'Heka PID IACA' }),
        subject: buildDistinguishedName({ ...dn, commonName: 'Heka PID DSC' }),
        ...validity(),
        extensions: buildDscExtensions({
          subjectJwk: dsc.jwk,
          authorityJwk: iaca.jwk,
          extendedKeyUsageOids: [TEST_EKU_OID],
          certificatePolicyOids: [TEST_POLICY_OID],
        }),
      },
      crypto,
    )

    // EU extensions land in the DER
    expect(dscCert.getExtension(x509.ExtendedKeyUsageExtension)?.usages).toContain(TEST_EKU_OID)
    expect(dscCert.getExtension(x509.CertificatePolicyExtension)?.policies).toContain(TEST_POLICY_OID)
    expect(dscCert.subjectName.getField(ORGANIZATION_IDENTIFIER_OID)).toContain(ORG_ID)

    // Chain linkage: DSC.AKI == IACA.SKI, and the DSC signature verifies against the IACA key
    const dscAki = dscCert.getExtension(x509.AuthorityKeyIdentifierExtension)
    const iacaSki = iacaCert.getExtension(x509.SubjectKeyIdentifierExtension)
    expect(dscAki?.keyId).toBe(iacaSki?.keyId)
    expect(dscAki?.keyId).toBe(ecKeyIdentifierHex(iaca.jwk))
    expect(await dscCert.verify({ publicKey: iaca.keys.publicKey, signatureOnly: true }, crypto)).toBe(true)
  })
})
