/**
 * Wallet invocation schemes we are willing to render as a deep link / QR:
 * `openid4vp://` (OpenID4VP default — what Credo emits today), `haip://`
 * (P3.1), and the EUDI / mdoc profiles. Deliberately **no `https://`** — a
 * "wallet link" that opens a web page is exactly the phishing shape a
 * compromised upstream would produce, and none of these custom schemes is
 * executable by the browser. Extend consciously, never with a browser scheme.
 */
export const WALLET_URI_SCHEMES: ReadonlySet<string> = new Set([
  'openid4vp:',
  'haip:',
  'eudi-openid4vp:',
  'mdoc-openid4vp:',
])

/**
 * Minimal validation of the authorization request URI received from
 * heka-identity-service before it reaches the login page (`<a href>` + QR).
 * HTML escaping does not neutralize a `javascript:` (or any browser) scheme in
 * an `href`, so the value is allowlisted by scheme and required to be a JAR by
 * reference (`request_uri` — P1.6.1, "signed, always"). Fails closed: the
 * data route answers with a generic JSON error and nothing is rendered. Error
 * messages carry the scheme only — the URI is a single-use credential and must
 * not be logged.
 */
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
