// The wallet asks for host access one origin at a time, from the click that needs it: the review
// asks for what resolving the item contacts, the accept or present step for what it contacts next.

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function unique(origins: Array<string | null>): string[] {
  return [...new Set(origins.filter((origin): origin is string => origin !== null))]
}

/** The origin of `url` if the manifest lets the wallet ask for it: https, or http on localhost. */
export function grantableOrigin(url: unknown): string | null {
  if (typeof url !== 'string') return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol === 'https:') return parsed.origin
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  return parsed.protocol === 'http:' && local ? parsed.origin : null
}

export function originPattern(origin: string): string {
  return `${origin}/*`
}

/**
 * What resolving an offer or request URI contacts first: the URI itself when it is a web URL, its
 * `credential_offer_uri` or `request_uri`, and the issuer named in an offer passed by value.
 */
export function reviewOrigins(uri: string): string[] {
  let query: URLSearchParams
  try {
    query = new URL(uri).searchParams
  } catch {
    return []
  }
  let inlineIssuer: unknown
  try {
    inlineIssuer = asRecord(JSON.parse(query.get('credential_offer') ?? 'null'))?.credential_issuer
  } catch {
    inlineIssuer = undefined
  }
  return unique([
    grantableOrigin(uri),
    grantableOrigin(query.get('credential_offer_uri')),
    grantableOrigin(query.get('request_uri')),
    grantableOrigin(inlineIssuer),
  ])
}

/** What accepting a resolved offer contacts: the issuer's endpoints and its authorization servers. */
export function offerAcceptOrigins(resolved: unknown): string[] {
  const metadata = asRecord(asRecord(resolved)?.metadata)
  const issuer = asRecord(metadata?.credentialIssuer)
  const servers = Array.isArray(metadata?.authorizationServers) ? metadata.authorizationServers.map(asRecord) : []
  return unique(
    [
      issuer?.credential_issuer,
      issuer?.credential_endpoint,
      issuer?.nonce_endpoint,
      ...servers.flatMap((server) => [server?.issuer, server?.token_endpoint]),
    ].map(grantableOrigin),
  )
}

/** Where submitting a presentation posts it: the verifier's `response_uri`. */
export function presentationOrigins(resolved: unknown): string[] {
  const payload = asRecord(asRecord(resolved)?.authorizationRequestPayload)
  return unique([grantableOrigin(payload?.response_uri)])
}

/** The origins the wallet cannot contact yet. */
export async function missingHostAccess(origins: string[]): Promise<string[]> {
  if (!chrome.permissions?.contains) return origins
  const granted = await Promise.all(
    origins.map((origin) => chrome.permissions.contains({ origins: [originPattern(origin)] })),
  )
  return origins.filter((_, index) => !granted[index])
}

/**
 * Asks for the origins the wallet cannot contact yet, and returns those still not allowed. Must run
 * from a click: Chrome rejects permissions.request without a user gesture.
 */
export async function requestHostAccess(origins: string[]): Promise<string[]> {
  const missing = await missingHostAccess(origins)
  if (missing.length === 0) return []
  if (!chrome.permissions?.request) return missing
  const granted = await chrome.permissions.request({ origins: missing.map(originPattern) })
  return granted ? [] : missing
}
