import { sha256 } from '@noble/hashes/sha2.js'

/**
 * Browser stand-in for `@hiero-did-sdk/crypto`.
 * The published helper hashes with Node's `createHash`, which the extension
 * build leaves external. HCS topic checksums need a synchronous SHA-256.
 */
export class Crypto {
  public static sha256(data: Uint8Array | ArrayBuffer | string): string {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
    return toHex(sha256(bytes))
  }
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}
