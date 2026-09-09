import { webcrypto } from 'node:crypto'

import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom'
import * as xadesjs from 'xadesjs'
import { setNodeDependencies } from 'xml-core'

import { normalizeBase64Certificate } from './certificate-list'

/**
 * XAdES / XML-DSig signature verification for eIDAS Trusted Lists (ETSI TS 119 612). Verifies the
 * enveloped signature (C14N + reference digests + signature via
 * `xadesjs`), then requires the signing certificate to **match one of the caller-provided trusted signer
 * certificates** (byte-compared). FAIL-CLOSED: throws on any failure so an unverified/tampered TL can
 * never inject anchors.
 *
 * The trusted signers come from the LoTL traversal: the pinned Commission cert
 * (`EU_LOTL_SIGNER_CERTIFICATES`) when verifying the LoTL itself, then — for each national TL — the
 * signer(s) the verified LoTL declared for it (chain-based signer trust).
 */

const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#'

let engineReady = false
function ensureEngine(): void {
  if (engineReady) return
  // Native Node WebCrypto as the xadesjs crypto engine; @xmldom/xmldom as the DOM for xml-core.
  // Casts bridge node's `webcrypto` / @xmldom types to the lib.dom `Crypto`/`Document`/`Element` that
  // xadesjs's browser-leaning signatures expect (the library runs identically on either at runtime).
  xadesjs.Application.setEngine('NodeJS', webcrypto as unknown as Crypto)
  setNodeDependencies({ DOMParser, XMLSerializer, DOMImplementation })
  engineReady = true
}

export class TrustedListSignatureError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'TrustedListSignatureError'
  }
}

/**
 * Verify the enveloped XAdES signature of a Trusted List XML and confirm the signer is one of
 * `trustedSignerCertificates` (base64/PEM). Throws {@link TrustedListSignatureError} on any failure.
 */
export async function verifyTrustedListSignature(xml: string, trustedSignerCertificates: string[]): Promise<void> {
  ensureEngine()

  const trusted = new Set(trustedSignerCertificates.map(normalizeBase64Certificate).filter(Boolean))
  if (trusted.size === 0) {
    // The expected signer is the pinned Commission cert (EU_LOTL_SIGNER_CERTIFICATES, for the LoTL
    // itself) or the signer the verified LoTL declared for this national TL — empty means neither resolved.
    throw new TrustedListSignatureError('No trusted Trusted-List signer certificates were provided.')
  }

  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const signatures = doc.getElementsByTagNameNS(DSIG_NS, 'Signature')
  if (!signatures || signatures.length === 0) {
    throw new TrustedListSignatureError('Trusted List has no XML-DSig signature.')
  }

  const signedXml = new xadesjs.SignedXml(doc as unknown as Document)
  signedXml.LoadXml(signatures[0] as unknown as Element)
  let valid = false
  try {
    valid = await signedXml.Verify()
  } catch (error) {
    throw new TrustedListSignatureError(
      `Trusted List signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!valid) throw new TrustedListSignatureError('Trusted List signature is invalid.')

  // The XML-DSig is valid — now confirm WHO signed it is a pinned scheme-operator anchor.
  const certNodes = doc.getElementsByTagNameNS(DSIG_NS, 'X509Certificate')
  const signerCerts: string[] = []
  for (let i = 0; i < certNodes.length; i++) {
    const text = certNodes[i]?.textContent
    if (text && text.trim()) signerCerts.push(normalizeBase64Certificate(text))
  }
  if (signerCerts.length === 0) {
    throw new TrustedListSignatureError('Trusted List signature carries no X509 signing certificate.')
  }
  if (!signerCerts.some((certificate) => trusted.has(certificate))) {
    throw new TrustedListSignatureError('Trusted List signer certificate is not a configured scheme-operator anchor.')
  }
}
