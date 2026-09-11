import { webcrypto } from 'node:crypto'

import * as x509 from '@peculiar/x509'
import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom'
import * as xadesjs from 'xadesjs'
import { setNodeDependencies } from 'xml-core'

import { normalizeBase64Certificate } from './certificate-list'

/**
 * XAdES / XML-DSig signature verification for eIDAS Trusted Lists (ETSI TS 119 612). Verifies the
 * enveloped signature (C14N + reference digests via `xadesjs`) and checks the `SignatureValue` against
 * **the public keys of the caller-provided trusted signer certificates only** — never against a key the
 * document itself carries in `ds:KeyInfo`, which an attacker serving the document would control.
 * FAIL-CLOSED: throws on any failure so an unverified/tampered TL can never inject anchors.
 *
 * The trusted signers come from the LoTL traversal: the pinned Commission cert
 * (`EU_LOTL_SIGNER_CERTIFICATES`) when verifying the LoTL itself, then — for each national TL — the
 * signer(s) the verified LoTL declared for it (chain-based signer trust).
 */

const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#'

const crypto = webcrypto as unknown as Crypto

let engineReady = false
function ensureEngine(): void {
  if (engineReady) return
  // Native Node WebCrypto as the xadesjs crypto engine; @xmldom/xmldom as the DOM for xml-core.
  // Casts bridge node's `webcrypto` / @xmldom types to the lib.dom `Crypto`/`Document`/`Element` that
  // xadesjs's browser-leaning signatures expect (the library runs identically on either at runtime).
  xadesjs.Application.setEngine('NodeJS', crypto)
  setNodeDependencies({ DOMParser, XMLSerializer, DOMImplementation })
  engineReady = true
}

export class TrustedListSignatureError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'TrustedListSignatureError'
  }
}

type PinnedVerification =
  | { outcome: 'valid' }
  | { outcome: 'references-invalid'; detail?: string }
  | { outcome: 'signature-invalid' }

/**
 * `xadesjs.SignedXml` whose signature check is **bound to caller-supplied keys**. The stock `Verify()`
 * takes its keys from the document's own `ds:KeyInfo` when none is given (so whoever controls the
 * document controls the key), and `Verify({ key })` re-imports the given key under the SignedInfo
 * algorithm, which for ECDSA lacks the `namedCurve` Node's WebCrypto requires. This runs the same two
 * steps as the stock verifier — reference digests over the enveloped content, then the `SignatureValue`
 * — with exactly the given keys and reports which step failed.
 */
class PinnedSignedXml extends xadesjs.SignedXml {
  public async verifyWithKeys(keys: CryptoKey[]): Promise<PinnedVerification> {
    const root = this.document?.documentElement
    if (!root) throw new TrustedListSignatureError('Trusted List document has no root element.')
    try {
      // xmldsigjs reports a digest mismatch by throwing (an `XmlError`), not by returning false.
      if (!(await this.ValidateReferences(root.cloneNode(true) as Element))) return { outcome: 'references-invalid' }
    } catch (error) {
      return { outcome: 'references-invalid', detail: errorMessage(error) }
    }
    return (await this.ValidateSignatureValue(keys)) ? { outcome: 'valid' } : { outcome: 'signature-invalid' }
  }
}

/**
 * Import a pinned signer certificate's public key for verification under the signature's algorithm
 * (`SignedInfo/SignatureMethod`): ECDSA keys need their curve (read from the certificate), RSA keys the
 * digest of the signature method. Throws when the key does not fit the algorithm (e.g. an RSA pin for an
 * ECDSA signature) — such a pin cannot have produced the signature.
 */
async function importPinnedSignerKey(certificateBase64: string, signatureAlgorithm: Algorithm): Promise<CryptoKey> {
  const certificate = new x509.X509Certificate(Buffer.from(certificateBase64, 'base64'))
  const keyAlgorithm = certificate.publicKey.algorithm as { name: string; namedCurve?: string }
  const importParameters: Algorithm =
    signatureAlgorithm.name.toUpperCase() === 'ECDSA'
      ? ({ name: 'ECDSA', namedCurve: keyAlgorithm.namedCurve } as EcKeyImportParams)
      : signatureAlgorithm
  return certificate.publicKey.export(importParameters, ['verify'], crypto)
}

/**
 * Verify the enveloped XAdES signature of a Trusted List XML against the public keys of
 * `trustedSignerCertificates` (base64/PEM) — the signature is accepted only if one of those keys produced
 * it. Throws {@link TrustedListSignatureError} on any failure.
 */
export async function verifyTrustedListSignature(xml: string, trustedSignerCertificates: string[]): Promise<void> {
  ensureEngine()

  const pinned = [...new Set(trustedSignerCertificates.map(normalizeBase64Certificate).filter(Boolean))]
  if (pinned.length === 0) {
    // The expected signer is the pinned Commission cert (EU_LOTL_SIGNER_CERTIFICATES, for the LoTL
    // itself) or the signer the verified LoTL declared for this national TL — empty means neither resolved.
    throw new TrustedListSignatureError('No trusted Trusted-List signer certificates were provided.')
  }

  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const signatures = doc.getElementsByTagNameNS(DSIG_NS, 'Signature')
  if (!signatures || signatures.length === 0) {
    throw new TrustedListSignatureError('Trusted List has no XML-DSig signature.')
  }

  const signedXml = new PinnedSignedXml(doc as unknown as Document)
  try {
    signedXml.LoadXml(signatures[0] as unknown as Element)
  } catch (error) {
    throw new TrustedListSignatureError(`Trusted List signature could not be parsed: ${errorMessage(error)}`)
  }
  const signatureAlgorithm = signedXml.Algorithm
  if (!signatureAlgorithm) {
    throw new TrustedListSignatureError('Trusted List signature declares no supported SignatureMethod.')
  }

  // Only keys derived from the pinned certificates take part in the check — a pin whose key type does not
  // fit the signature algorithm cannot have signed the document and is skipped (reported if none remains).
  const keys: CryptoKey[] = []
  const unusable: string[] = []
  for (const certificate of pinned) {
    try {
      keys.push(await importPinnedSignerKey(certificate, signatureAlgorithm))
    } catch (error) {
      unusable.push(errorMessage(error))
    }
  }
  if (keys.length === 0) {
    throw new TrustedListSignatureError(
      `Trusted List signer certificate is not a configured scheme-operator anchor: none of the ${pinned.length} pinned ` +
        `certificate(s) fits the signature algorithm ${signatureAlgorithm.name} (${unusable.join('; ')}).`,
    )
  }

  let result: PinnedVerification
  try {
    result = await signedXml.verifyWithKeys(keys)
  } catch (error) {
    throw new TrustedListSignatureError(`Trusted List signature verification failed: ${errorMessage(error)}`)
  }
  if (result.outcome === 'references-invalid') {
    throw new TrustedListSignatureError(
      `Trusted List signature is invalid: the content does not match the signed digests${result.detail ? ` (${result.detail})` : ''}.`,
    )
  }
  if (result.outcome === 'signature-invalid') {
    throw new TrustedListSignatureError(
      'Trusted List signer certificate is not a configured scheme-operator anchor: the signature was not produced by a pinned signer.',
    )
  }
}

/** Message of a thrown value — xml-core's `XmlError` objects are not always `Error` instances. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message)
  return String(error)
}
