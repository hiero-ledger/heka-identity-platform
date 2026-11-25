/** A copy of exactly these bytes, as WebCrypto takes them (not the whole underlying buffer). */
export function asBuffer(bytes: Uint8Array): BufferSource {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const combined = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    combined.set(part, offset)
    offset += part.length
  }
  return combined
}
