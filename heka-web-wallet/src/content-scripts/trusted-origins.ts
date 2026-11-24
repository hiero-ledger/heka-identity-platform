/**
 * Pages allowed to talk to the wallet bridge. Keep this list identical to the
 * content_scripts.matches entries in manifest.json. A wildcard host would let
 * any page on that domain push a credential offer.
 */
export const TRUSTED_HEKA_ORIGINS = [
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'https://heka.hiero.org',
] as const

export function isTrustedHekaOrigin(origin: string): boolean {
  return (TRUSTED_HEKA_ORIGINS as readonly string[]).includes(origin)
}
