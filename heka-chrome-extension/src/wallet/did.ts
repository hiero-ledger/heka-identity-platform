import { getPublicKeyJwk } from './key-store'

function base64urlEncode(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function stringToBase64url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  return base64urlEncode(bytes)
}

/**
 * Derives the holder's did:jwk DID from the stored public key.
 * The JWK is serialised deterministically — same key always produces the same DID.
 */
export async function getHolderDid(): Promise<string> {
  const jwk = await getPublicKeyJwk()
  // Produce a canonical JSON representation by sorting keys alphabetically.
  const canonicalJwk = JSON.stringify(jwk, Object.keys(jwk).sort())
  const encoded = stringToBase64url(canonicalJwk)
  return `did:jwk:${encoded}`
}

/**
 * Decodes a did:jwk string back into a JWK object.
 * Used by the verifier side — included here for completeness and testing.
 */
export function resolveDidjwk(did: string): JsonWebKey {
  if (!did.startsWith('did:jwk:')) {
    throw new Error(`Not a did:jwk DID: ${did}`)
  }
  const encoded = did.slice('did:jwk:'.length)
  // Restore standard base64 padding
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    encoded.length + (4 - (encoded.length % 4)) % 4,
    '=',
  )
  const json = atob(padded)
  return JSON.parse(json) as JsonWebKey
}
