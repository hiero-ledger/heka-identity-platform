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

const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const

async function makeSigner(): Promise<{ keys: CryptoKeyPair; certBase64: string }> {
  const keys = await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])
  const cert = await x509.X509CertificateGenerator.createSelfSigned(
    { keys, name: 'CN=Test Scheme Operator', notBefore: new Date('2026-01-01Z'), notAfter: new Date('2031-01-01Z') },
    crypto,
  )
  return { keys, certBase64: Buffer.from(cert.rawData).toString('base64') }
}

async function signTrustedList(marker: string, keys: CryptoKeyPair, certBase64: string): Promise<string> {
  const xml = `<?xml version="1.0"?><TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#" Id="tl"><SchemeInformation>${marker}</SchemeInformation></TrustServiceStatusList>`
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const signed = new xadesjs.SignedXml()
  const signature = await signed.Sign(alg, keys.privateKey, doc as unknown as Document, {
    x509: [certBase64],
    references: [{ uri: '', hash: 'SHA-256', transforms: ['enveloped', 'c14n'] }],
  })
  const rootElement = doc.documentElement as unknown as Element
  rootElement.appendChild(signature.GetXml() as unknown as Node)
  return new XMLSerializer().serializeToString(doc)
}

describe('verifyTrustedListSignature', () => {
  let signer: { keys: CryptoKeyPair; certBase64: string }
  let signedTl: string

  beforeAll(async () => {
    signer = await makeSigner()
    signedTl = await signTrustedList('PAYLOAD', signer.keys, signer.certBase64)
  })

  test('accepts a valid TL signed by a pinned (trusted) scheme-operator signer', async () => {
    await expect(verifyTrustedListSignature(signedTl, [signer.certBase64])).resolves.toBeUndefined()
  })

  test('rejects a valid signature whose signer is not a configured anchor', async () => {
    const other = await makeSigner()
    await expect(verifyTrustedListSignature(signedTl, [other.certBase64])).rejects.toThrow(
      /not a configured scheme-operator anchor/,
    )
  })

  test('rejects a tampered Trusted List', async () => {
    const tampered = signedTl.replace('PAYLOAD', 'TAMPERED')
    await expect(verifyTrustedListSignature(tampered, [signer.certBase64])).rejects.toThrow()
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
