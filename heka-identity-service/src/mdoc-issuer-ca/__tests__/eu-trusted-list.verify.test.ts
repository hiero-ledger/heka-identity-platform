import { webcrypto } from 'node:crypto'

import * as x509 from '@peculiar/x509'
import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom'
import * as xadesjs from 'xadesjs'
import { setNodeDependencies } from 'xml-core'

import { verifyTrustedListSignature } from '../eu-trusted-list.verify'

const crypto = webcrypto as unknown as Crypto
xadesjs.Application.setEngine('NodeJS', crypto)
setNodeDependencies({ DOMParser, XMLSerializer, DOMImplementation })
x509.cryptoProvider.set(crypto)

const ecdsa = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const
const rsa = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
} as const

type Signer = { keys: CryptoKeyPair; certBase64: string; algorithm: typeof ecdsa | typeof rsa }

async function makeSigner(algorithm: typeof ecdsa | typeof rsa = ecdsa): Promise<Signer> {
  const keys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])
  const cert = await x509.X509CertificateGenerator.createSelfSigned(
    {
      keys,
      name: 'CN=Test Scheme Operator',
      notBefore: new Date('2026-01-01Z'),
      notAfter: new Date('2031-01-01Z'),
      signingAlgorithm: algorithm,
    },
    crypto,
  )
  return { keys, certBase64: Buffer.from(cert.rawData).toString('base64'), algorithm }
}

/**
 * Sign a minimal TL with `signer`'s private key. `keyInfo` controls what the signature's `ds:KeyInfo`
 * advertises — by default the signer's own certificate; the attack cases advertise other material.
 */
async function signTrustedList(
  marker: string,
  signer: Signer,
  keyInfo: { x509?: string[]; keyValue?: CryptoKey } = { x509: [signer.certBase64] },
): Promise<string> {
  const xml = `<?xml version="1.0"?><TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#" Id="tl"><SchemeInformation>${marker}</SchemeInformation></TrustServiceStatusList>`
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const signed = new xadesjs.SignedXml()
  const signature = await signed.Sign(signer.algorithm, signer.keys.privateKey, doc as unknown as Document, {
    ...keyInfo,
    references: [{ uri: '', hash: 'SHA-256', transforms: ['enveloped', 'c14n'] }],
  })
  const rootElement = doc.documentElement as unknown as Element
  rootElement.appendChild(signature.GetXml() as unknown as Node)
  return new XMLSerializer().serializeToString(doc)
}

describe('verifyTrustedListSignature', () => {
  let signer: Signer
  let signedTl: string

  beforeAll(async () => {
    signer = await makeSigner()
    signedTl = await signTrustedList('PAYLOAD', signer)
  })

  test('accepts a valid TL signed by a pinned (trusted) scheme-operator signer', async () => {
    await expect(verifyTrustedListSignature(signedTl, [signer.certBase64])).resolves.toBeUndefined()
  })

  test('accepts when any one of several pinned signers produced the signature', async () => {
    const other = await makeSigner()
    await expect(verifyTrustedListSignature(signedTl, [other.certBase64, signer.certBase64])).resolves.toBeUndefined()
  })

  test('accepts an RSA-SHA256 signed TL (the Commission LoTL signature type) against an RSA pin', async () => {
    const rsaSigner = await makeSigner(rsa)
    const rsaTl = await signTrustedList('PAYLOAD', rsaSigner)
    await expect(verifyTrustedListSignature(rsaTl, [rsaSigner.certBase64])).resolves.toBeUndefined()
    await expect(verifyTrustedListSignature(rsaTl, [signer.certBase64])).rejects.toThrow(
      /not a configured scheme-operator anchor/,
    )
  })

  test('rejects a valid signature whose signer is not a configured anchor', async () => {
    const other = await makeSigner()
    await expect(verifyTrustedListSignature(signedTl, [other.certBase64])).rejects.toThrow(
      /not a configured scheme-operator anchor/,
    )
  })

  test('rejects an attacker-signed TL whose KeyInfo also carries the pinned certificate', async () => {
    // The signature verifies against the attacker key advertised in KeyInfo (which is what an unbound
    // Verify() would use); the pinned certificate merely sits next to it. Must not pass.
    const attacker = await makeSigner()
    const forged = await signTrustedList('INJECTED', attacker, { x509: [attacker.certBase64, signer.certBase64] })
    await expect(verifyTrustedListSignature(forged, [signer.certBase64])).rejects.toThrow(
      /not a configured scheme-operator anchor/,
    )
  })

  test('rejects an attacker-signed TL advertising its KeyValue plus the pinned certificate', async () => {
    const attacker = await makeSigner()
    const forged = await signTrustedList('INJECTED', attacker, {
      keyValue: attacker.keys.publicKey,
      x509: [signer.certBase64],
    })
    await expect(verifyTrustedListSignature(forged, [signer.certBase64])).rejects.toThrow(
      /not a configured scheme-operator anchor/,
    )
  })

  test('a pinned certificate whose key type does not fit the signature algorithm is skipped, not trusted', async () => {
    const rsaPin = await makeSigner(rsa)
    // ECDSA-signed list: the RSA pin cannot verify it; the matching ECDSA pin still does.
    await expect(verifyTrustedListSignature(signedTl, [rsaPin.certBase64, signer.certBase64])).resolves.toBeUndefined()
    await expect(verifyTrustedListSignature(signedTl, [rsaPin.certBase64])).rejects.toThrow(
      /not a configured scheme-operator anchor/,
    )
  })

  test('rejects a tampered Trusted List', async () => {
    const tampered = signedTl.replace('PAYLOAD', 'TAMPERED')
    await expect(verifyTrustedListSignature(tampered, [signer.certBase64])).rejects.toThrow(
      /content does not match the signed digests/,
    )
  })

  test('rejects when no scheme-operator signer is configured', async () => {
    await expect(verifyTrustedListSignature(signedTl, [])).rejects.toThrow(/No trusted Trusted-List signer/)
  })

  test('rejects a Trusted List with no XML-DSig signature', async () => {
    await expect(verifyTrustedListSignature('<TrustServiceStatusList/>', [signer.certBase64])).rejects.toThrow(
      /no XML-DSig signature/,
    )
  })
})
