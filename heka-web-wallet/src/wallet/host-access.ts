// The wallet asks for host access one origin at a time, from the click that needs it: the review
// asks for what resolving the item contacts, the accept or present step for what it contacts next.

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** What a step contacts: the origins to ask access for, and the URLs it can never ask access for. */
export interface StepOrigins {
  origins: string[]
  refused: string[]
}

/** A field that is absent, empty or not a string names no URL; any other is a URL the step would contact. */
function stepOrigins(urls: unknown[]): StepOrigins {
  const origins = new Set<string>()
  const refused = new Set<string>()
  for (const url of urls) {
    if (typeof url !== 'string' || url === '') continue
    const origin = grantableOrigin(url)
    if (origin) origins.add(origin)
    else refused.add(url)
  }
  return { origins: [...origins], refused: [...refused] }
}

const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/

/**
 * Whether a parsed URL's hostname names one host in a match pattern. The URL parser has already
 * turned an IDN into punycode and an IPv4 address into dotted decimal, both of which pass. It
 * keeps `*` (also when percent-encoded: `exa%2Ample.com` is `exa*mple.com`), which a pattern reads
 * as a wildcard or refuses, so only letters, digits and inner hyphens pass. IPv6 literals and a
 * trailing dot are refused.
 */
function isSingleHost(hostname: string): boolean {
  return hostname.length <= 253 && hostname.split('.').every((label) => HOST_LABEL.test(label))
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
  if (!isSingleHost(parsed.hostname)) return null
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
export function reviewOrigins(uri: string): StepOrigins {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return { origins: [], refused: [] }
  }
  const query = parsed.searchParams
  let inlineIssuer: unknown
  try {
    inlineIssuer = asRecord(JSON.parse(query.get('credential_offer') ?? 'null'))?.credential_issuer
  } catch {
    inlineIssuer = undefined
  }
  const web = parsed.protocol === 'https:' || parsed.protocol === 'http:'
  return stepOrigins([web ? uri : null, query.get('credential_offer_uri'), query.get('request_uri'), inlineIssuer])
}

/** What accepting a resolved offer contacts: the issuer's endpoints and its authorization servers. */
export function offerAcceptOrigins(resolved: unknown): StepOrigins {
  const metadata = asRecord(asRecord(resolved)?.metadata)
  const issuer = asRecord(metadata?.credentialIssuer)
  const servers = Array.isArray(metadata?.authorizationServers) ? metadata.authorizationServers.map(asRecord) : []
  return stepOrigins([
    issuer?.credential_issuer,
    issuer?.credential_endpoint,
    issuer?.nonce_endpoint,
    ...servers.flatMap((server) => [server?.issuer, server?.token_endpoint]),
  ])
}

/** Where submitting a presentation posts it: the verifier's `response_uri`. */
export function presentationOrigins(resolved: unknown): StepOrigins {
  const payload = asRecord(asRecord(resolved)?.authorizationRequestPayload)
  return stepOrigins([payload?.response_uri])
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
