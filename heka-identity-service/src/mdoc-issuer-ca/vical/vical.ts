import { cborDecode, cborEncode } from './cbor'
import { buildCoseSign1Es256, CoseEs256Signer } from './cose-sign1'

/**
 * Heka VICAL (trust list) encoder. Structure follows ISO/IEC 18013-5 Annex C — the published-2021
 * `Vical` field names (the 2020 DIS calls it `MasterList`); the encoding has not yet been validated
 * against an external AAMVA/EU sample. Field names are centralized here so they can be corrected
 * against a real `Vical` sample without touching the service.
 *
 * `date`/`notBefore`/`notAfter` are encoded as native CBOR time (a `Date` → standard CBOR time tag);
 * `serialNumber` is a CBOR (big)uint; `certificate`/`ski` are byte strings. NOTE: cbor-x emits epoch
 * time (tag 1) for a `Date`; ISO `tdate` prefers the tag-0 RFC 3339 string — a follow-up for external
 * interop alongside the external-sample validation (the Heka service↔wallet round-trip is unaffected).
 */

export interface VicalCertificateInfo {
  /** DER bytes of the IACA certificate. */
  certificateDer: Uint8Array
  /** Certificate serial number. */
  serialNumber: bigint
  /** subjectKeyIdentifier bytes. */
  ski: Uint8Array
  /** mdoc docTypes this IACA is authoritative for. */
  docTypes: string[]
  issuingAuthority?: string
  /** ISO 3166-1 alpha-2 country code. */
  issuingCountry?: string
  /** RFC 3339 date-time. */
  notBefore?: string
  /** RFC 3339 date-time. */
  notAfter?: string
}

export interface VicalInput {
  /** VICAL format version, e.g. "1.0". */
  version: string
  /** Name of the VICAL provider (Heka). */
  vicalProvider: string
  /** Issuance date (RFC 3339 date-time). */
  date: string
  /** When the provider expects to re-sign (RFC 3339 date-time). */
  nextUpdate?: string
  /** Monotonic issue counter. */
  vicalIssueID?: number
  certificateInfos: VicalCertificateInfo[]
}

function certificateInfoToMap(info: VicalCertificateInfo): Map<string, unknown> {
  const map = new Map<string, unknown>()
  map.set('certificate', info.certificateDer)
  map.set('serialNumber', info.serialNumber)
  map.set('ski', info.ski)
  map.set('docType', info.docTypes)
  if (info.issuingAuthority) map.set('issuingAuthority', info.issuingAuthority)
  if (info.issuingCountry) map.set('issuingCountry', info.issuingCountry)
  if (info.notBefore) map.set('notBefore', new Date(info.notBefore))
  if (info.notAfter) map.set('notAfter', new Date(info.notAfter))
  return map
}

/** Encode the VICAL payload (the CBOR map signed inside the COSE_Sign1). */
export function encodeVicalPayload(input: VicalInput): Uint8Array {
  const map = new Map<string, unknown>()
  map.set('version', input.version)
  map.set('vicalProvider', input.vicalProvider)
  map.set('date', new Date(input.date))
  if (input.nextUpdate) map.set('nextUpdate', new Date(input.nextUpdate))
  if (input.vicalIssueID !== undefined) map.set('vicalIssueID', input.vicalIssueID)
  map.set('certificateInfos', input.certificateInfos.map(certificateInfoToMap))
  return cborEncode(map)
}

/** Recursively turn decoded CBOR Maps into plain objects (cbor-x decodes maps to `Map`). Byte
 * strings, Dates and BigInts pass through unchanged. */
function mapsToObjects(value: unknown): unknown {
  if (value instanceof Map) {
    const out: Record<string, unknown> = {}
    for (const [key, val] of value) out[String(key)] = mapsToObjects(val)
    return out
  }
  if (Array.isArray(value)) return value.map(mapsToObjects)
  return value
}

/** Decode a VICAL payload back to a plain object (for round-trip tests / the wallet consumer). */
export function decodeVicalPayload(bytes: Uint8Array): Record<string, unknown> {
  return mapsToObjects(cborDecode(bytes)) as Record<string, unknown>
}

/**
 * Build the signed VICAL: encode the payload, then wrap it in a COSE_Sign1(ES256) carrying the VICAL
 * signer chain (leaf-first, e.g. [signer-leaf, service-root]) in the `x5chain` header.
 */
export async function buildSignedVical({
  vical,
  certificateChain,
  sign,
}: {
  vical: VicalInput
  certificateChain: Uint8Array[]
  sign: CoseEs256Signer
}): Promise<Uint8Array> {
  const payload = encodeVicalPayload(vical)
  return buildCoseSign1Es256({ payload, certificateChain, sign })
}
