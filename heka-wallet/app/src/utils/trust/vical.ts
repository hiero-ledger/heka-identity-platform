import { cborDecodeFirst, cborMapToObject } from './cbor'

/** A per-tenant IACA entry extracted from the VICAL. */
export interface ParsedCertificateInfo {
  /** Base64 DER of the IACA certificate (an mdoc issuer trust anchor). */
  certificateBase64: string
  /** mdoc docTypes this IACA is authoritative for. */
  docTypes: string[]
  issuingAuthority?: string
  issuingCountry?: string
}

/** A decoded (not-yet-verified) VICAL: the COSE_Sign1 parts plus the parsed trust list. */
export interface ParsedVical {
  /** COSE protected header bytes (needed verbatim to rebuild the Sig_structure). */
  protectedHeader: Uint8Array
  /** x5chain from the COSE header, leaf-first (VICAL signer leaf, then the service root). */
  certificateChainBase64: string[]
  /** COSE payload bytes (the CBOR-encoded VICAL; needed verbatim for the Sig_structure). */
  payload: Uint8Array
  /** COSE signature bytes (raw R‖S for ES256). */
  signature: Uint8Array
  version?: string
  vicalProvider?: string
  vicalIssueID?: number
  certificateInfos: ParsedCertificateInfo[]
}

const COSE_HEADER_X5CHAIN = 33

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/**
 * Decode a signed VICAL (COSE_Sign1 over CBOR) into its parts and trust list. Performs NO signature
 * or chain verification — that is the caller's responsibility (see trust-list.service.ts).
 */
export function parseVical(bytes: Uint8Array): ParsedVical {
  const cose = cborDecodeFirst(bytes)
  if (!Array.isArray(cose) || cose.length !== 4) {
    throw new Error('Invalid VICAL: expected a COSE_Sign1 (4-element array)')
  }
  const [protectedHeader, unprotectedHeader, payload, signature] = cose as [
    Uint8Array,
    Map<unknown, unknown>,
    Uint8Array,
    Uint8Array,
  ]

  const x5chain = unprotectedHeader instanceof Map ? unprotectedHeader.get(COSE_HEADER_X5CHAIN) : undefined
  const certificateChain: Uint8Array[] = Array.isArray(x5chain)
    ? (x5chain as Uint8Array[])
    : x5chain instanceof Uint8Array
      ? [x5chain]
      : []
  if (certificateChain.length === 0) {
    throw new Error('Invalid VICAL: missing x5chain in the COSE header')
  }

  const vical = cborMapToObject(cborDecodeFirst(payload)) as Record<string, unknown>
  const rawInfos = (vical.certificateInfos as Array<Record<string, unknown>> | undefined) ?? []
  const certificateInfos: ParsedCertificateInfo[] = rawInfos.map((info) => ({
    certificateBase64: toBase64(info.certificate as Uint8Array),
    docTypes: (info.docType as string[] | undefined) ?? [],
    issuingAuthority: info.issuingAuthority as string | undefined,
    issuingCountry: info.issuingCountry as string | undefined,
  }))

  return {
    protectedHeader,
    certificateChainBase64: certificateChain.map(toBase64),
    payload,
    signature,
    version: vical.version as string | undefined,
    vicalProvider: vical.vicalProvider as string | undefined,
    vicalIssueID: vical.vicalIssueID as number | undefined,
    certificateInfos,
  }
}
