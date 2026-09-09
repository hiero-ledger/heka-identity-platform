/**
 * Minimal, dependency-free CBOR (RFC 8949) reader for parsing the Heka VICAL, plus a tiny writer for
 * the COSE `Sig_structure`. Hand-rolled rather than pulling in cbor-x so it is safe on React
 * Native/Hermes and so the `Sig_structure` bytes are reproduced byte-for-byte for signature
 * verification. Only the subset the VICAL uses is implemented:
 * unsigned/negative ints, byte/text strings, arrays, maps, tags (0/1/2 and the COSE_Sign1 tag 18)
 * and the major-7 simples/floats. `Buffer` (present in RN via the Credo/askar stack and natively in
 * Node) handles UTF-8.
 */

interface Reader {
  bytes: Uint8Array
  view: DataView
  pos: number
}

function readArgument(reader: Reader, additionalInfo: number): number | bigint {
  if (additionalInfo < 24) return additionalInfo
  if (additionalInfo === 24) return reader.bytes[reader.pos++]
  if (additionalInfo === 25) {
    const value = reader.view.getUint16(reader.pos)
    reader.pos += 2
    return value
  }
  if (additionalInfo === 26) {
    const value = reader.view.getUint32(reader.pos)
    reader.pos += 4
    return value
  }
  if (additionalInfo === 27) {
    const value = reader.view.getBigUint64(reader.pos)
    reader.pos += 8
    // Collapse to a Number when it is exactly representable, else keep the BigInt.
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value
  }
  throw new Error(`Unsupported CBOR additional info: ${additionalInfo}`)
}

function applyTag(tagNumber: number, content: unknown): unknown {
  switch (tagNumber) {
    case 0: // RFC 3339 date-time string
      return new Date(content as string)
    case 1: // epoch-based time (seconds; may be int or float)
      return new Date(Number(content) * 1000)
    case 2: {
      // unsigned bignum: big-endian bytes
      let result = 0n
      for (const byte of content as Uint8Array) result = (result << 8n) | BigInt(byte)
      return result
    }
    case 18: // COSE_Sign1 — unwrap to the inner array
      return content
    default:
      return { tag: tagNumber, value: content }
  }
}

function readItem(reader: Reader): unknown {
  const initialByte = reader.bytes[reader.pos++]
  const majorType = initialByte >> 5
  const additionalInfo = initialByte & 0x1f

  if (majorType === 7) {
    if (additionalInfo === 20) return false
    if (additionalInfo === 21) return true
    if (additionalInfo === 22) return null
    if (additionalInfo === 23) return undefined
    if (additionalInfo === 26) {
      const value = reader.view.getFloat32(reader.pos)
      reader.pos += 4
      return value
    }
    if (additionalInfo === 27) {
      const value = reader.view.getFloat64(reader.pos)
      reader.pos += 8
      return value
    }
    throw new Error(`Unsupported CBOR simple value: ${additionalInfo}`)
  }

  const argument = readArgument(reader, additionalInfo)

  switch (majorType) {
    case 0: // unsigned integer
      return argument
    case 1: // negative integer
      return typeof argument === 'bigint' ? -1n - argument : -1 - argument
    case 2: {
      // byte string
      const length = Number(argument)
      const slice = reader.bytes.slice(reader.pos, reader.pos + length)
      reader.pos += length
      return slice
    }
    case 3: {
      // text string
      const length = Number(argument)
      const text = Buffer.from(reader.bytes.subarray(reader.pos, reader.pos + length)).toString('utf8')
      reader.pos += length
      return text
    }
    case 4: {
      // array
      const length = Number(argument)
      const items: unknown[] = []
      for (let i = 0; i < length; i++) items.push(readItem(reader))
      return items
    }
    case 5: {
      // map
      const length = Number(argument)
      const map = new Map<unknown, unknown>()
      for (let i = 0; i < length; i++) {
        const key = readItem(reader)
        map.set(key, readItem(reader))
      }
      return map
    }
    case 6: // tag
      return applyTag(Number(argument), readItem(reader))
    default:
      throw new Error(`Unsupported CBOR major type: ${majorType}`)
  }
}

/** Decode a single CBOR item from `bytes`. */
export function cborDecodeFirst(bytes: Uint8Array): unknown {
  return readItem({ bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), pos: 0 })
}

/** Recursively convert decoded CBOR `Map`s (string keys) to plain objects, leaving other values as-is. */
export function cborMapToObject(value: unknown): unknown {
  if (value instanceof Map) {
    const object: Record<string, unknown> = {}
    for (const [key, val] of value) object[String(key)] = cborMapToObject(val)
    return object
  }
  if (Array.isArray(value)) return value.map(cborMapToObject)
  return value
}

// ── Minimal writer (only what the COSE Sig_structure needs) ─────────────────────────────────────

function encodeHead(majorType: number, length: number): number[] {
  const base = majorType << 5
  if (length < 24) return [base | length]
  if (length < 0x100) return [base | 24, length]
  if (length < 0x10000) return [base | 25, length >> 8, length & 0xff]
  return [base | 26, (length >>> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]
}

function encodeByteString(bytes: Uint8Array): number[] {
  return [...encodeHead(2, bytes.length), ...bytes]
}

function encodeTextString(text: string): number[] {
  const bytes = Buffer.from(text, 'utf8')
  return [...encodeHead(3, bytes.length), ...bytes]
}

/**
 * Encode the COSE `Sig_structure` for a Signature1 (RFC 9052 §4.4):
 * `[ "Signature1", protected, external_aad (empty), payload ]`. Uses canonical minimal-length CBOR so
 * the bytes match what the signer produced.
 */
export function encodeSigStructure(protectedHeader: Uint8Array, payload: Uint8Array): Uint8Array {
  const out: number[] = [
    ...encodeHead(4, 4),
    ...encodeTextString('Signature1'),
    ...encodeByteString(protectedHeader),
    ...encodeByteString(new Uint8Array(0)),
    ...encodeByteString(payload),
  ]
  return Uint8Array.from(out)
}
