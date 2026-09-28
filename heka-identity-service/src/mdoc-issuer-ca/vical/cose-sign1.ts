import { cborDecode, cborEncode, unwrapCborTag } from './cbor'

/**
 * Minimal COSE_Sign1 (RFC 9052) builder for the VICAL (Credo does not export its COSE implementation).
 * Single-signer, ES256, with the X.509 chain carried in the
 * unprotected `x5chain` header (RFC 9360, per ISO 18013-5 Annex C.1.7).
 */
const COSE_SIGN1_TAG = 18
// CBOR tag head for a tag number < 24: major type 6 (0xc0) | tag number. 0xc0 | 18 = 0xd2.
const COSE_SIGN1_TAG_HEAD = 0xc0 + COSE_SIGN1_TAG
const COSE_ALG_ES256 = -7
const COSE_HEADER_ALG = 1
const COSE_HEADER_X5CHAIN = 33

/** Sign `data` (the COSE Sig_structure) returning a raw R‖S ES256 signature (64 bytes). */
export type CoseEs256Signer = (data: Uint8Array) => Promise<Uint8Array>

/**
 * Build a tagged COSE_Sign1 (ES256) over `payload`, embedding `certificateChain` (DER, leaf-first) in
 * the unprotected `x5chain` header. The signature is computed over the canonical `Signature1`
 * Sig_structure using the exact protected-header and payload bytes that are embedded, so a verifier
 * reproduces them byte-for-byte regardless of CBOR map ordering.
 */
export async function buildCoseSign1Es256({
  payload,
  certificateChain,
  sign,
}: {
  payload: Uint8Array
  certificateChain: Uint8Array[]
  sign: CoseEs256Signer
}): Promise<Uint8Array> {
  if (certificateChain.length === 0) throw new Error('COSE_Sign1 x5chain requires at least one certificate')

  const protectedHeader = cborEncode(new Map<number, number>([[COSE_HEADER_ALG, COSE_ALG_ES256]]))

  // Sig_structure = [ "Signature1", protected, external_aad (empty), payload ]
  const sigStructure = cborEncode(['Signature1', protectedHeader, new Uint8Array(0), payload])
  const signature = await sign(sigStructure)

  // x5chain: a single bstr when one cert, else an array of bstr (RFC 9360).
  const x5chain = certificateChain.length === 1 ? certificateChain[0] : certificateChain
  const unprotectedHeader = new Map<number, unknown>([[COSE_HEADER_X5CHAIN, x5chain]])

  // Wrap the 4-element COSE_Sign1 array in the tag-18 head byte manually (no cbor-x `Tag` — see cbor.ts).
  const body = cborEncode([protectedHeader, unprotectedHeader, payload, signature])
  const tagged = new Uint8Array(body.length + 1)
  tagged[0] = COSE_SIGN1_TAG_HEAD
  tagged.set(body, 1)
  return tagged
}

/** Decode a COSE_Sign1 into its four elements (for tests / verification); the tag-18 wrapper is unwrapped
 * structurally (no cbor-x `Tag` — see cbor.ts). */
export function decodeCoseSign1(bytes: Uint8Array): {
  protectedHeader: Uint8Array
  unprotectedHeader: Map<number, unknown> | Record<string, unknown>
  payload: Uint8Array
  signature: Uint8Array
} {
  // Strip the tag-18 head byte (if present) and decode the plain 4-element array.
  const body = bytes[0] === COSE_SIGN1_TAG_HEAD ? bytes.subarray(1) : bytes
  const arr = unwrapCborTag(cborDecode(body)) as [
    Uint8Array,
    Map<number, unknown> | Record<string, unknown>,
    Uint8Array,
    Uint8Array,
  ]
  if (!Array.isArray(arr)) throw new Error('Invalid COSE_Sign1: expected a 4-element array')
  const [protectedHeader, unprotectedHeader, payload, signature] = arr
  return { protectedHeader, unprotectedHeader, payload, signature }
}
