export const WALLET_URI_SCHEMES: ReadonlySet<string> = new Set(['openid4vp:', 'haip:', 'eudi-openid4vp:', 'mdoc-openid4vp:'])

export function assertWalletAuthorizationRequest(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('authorization request is not a valid URI')
  }
  if (!WALLET_URI_SCHEMES.has(url.protocol)) {
    throw new Error(`authorization request has unexpected scheme '${url.protocol}'`)
  }
  if (!url.searchParams.get('request_uri')) {
    throw new Error('authorization request is not a JAR by reference (request_uri missing)')
  }
  return value
}
