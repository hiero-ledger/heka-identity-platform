/**
 * Query parameters that carry OID4VC session secrets, masked in the logged request URL and query.
 * - `GET /openid4vc/issuance-session` (`GetIssuanceSessionByQueryDto`): the pre-authorized code redeems the offer,
 *   the offer URI dereferences to it, and the c_nonce is session-binding material.
 * - `GET /openid4vc/verification-session` (`GetVerificationSessionByQueryDto`): the authorization request URI
 *   dereferences to the live presentation request, and the nonce and payload state bind the session.
 * No other endpoint of the service takes query parameters with these names.
 */
export const SECRET_QUERY_PARAMS: readonly string[] = [
  'preAuthorizedCode',
  'credentialOfferUri',
  'cNonce',
  'nonce',
  'authorizationRequestUri',
  'payloadState',
]

const CENSOR = '******'

/**
 * pino `req` serializer that masks {@link SECRET_QUERY_PARAMS} in `url` and `query`.
 *
 * pino applies it to every log object key named `req`. Inside an HTTP request, pino-http runs it after the standard
 * request serializer, so it receives the reduced request (`id`, `method`, `url`, `query`, `params`, `headers`, ...)
 * built from whatever was logged under `req`. Outside a request, nestjs-pino logs through a plain `pino(config)`
 * logger that passes it the logged value as is, e.g. a body DTO bound as `{ req }`, so it accepts any value and
 * never throws. It never mutates its input: `query` is the live `req.query` that the controller reads.
 */
export function maskSecretsInRequest<T>(req: T): T {
  if (typeof req !== 'object' || req === null) return req

  const { url, query } = req as { url?: unknown; query?: unknown }
  const maskedUrl = typeof url === 'string' ? maskSecretsInUrl(url) : url
  const maskedQuery = isObject(query) ? maskQuery(query) : query
  if (maskedUrl === url && maskedQuery === query) return req

  // Keep the prototype: pino-std-serializers exposes the raw request through a getter on it
  const masked = Object.create(Object.getPrototypeOf(req) as object | null) as Record<string, unknown>
  Object.assign(masked, req, { url: maskedUrl, query: maskedQuery })
  return masked as T
}

/**
 * Masks the values of {@link SECRET_QUERY_PARAMS} in a request URL and keeps the path and the other parameters.
 * Use it for any URL bound to a logger outside pino-http's `req`, e.g. `{ url: maskSecretsInUrl(request.url) }`.
 */
export function maskSecretsInUrl<T extends string | undefined>(url: T): T {
  if (url === undefined) return url
  const queryStart = url.indexOf('?')
  if (queryStart === -1) return url

  const fragmentStart = url.indexOf('#', queryStart)
  const queryEnd = fragmentStart === -1 ? url.length : fragmentStart
  const params = url.slice(queryStart + 1, queryEnd).split('&')

  let changed = false
  const maskedParams = params.map((param) => {
    const separator = param.indexOf('=')
    if (separator === -1) return param
    const rawName = param.slice(0, separator)
    // The query parser decodes names, so an encoded name still reaches the controller as the secret parameter
    if (!SECRET_QUERY_PARAMS.includes(decodeName(rawName))) return param
    changed = true
    return `${rawName}=${CENSOR}`
  })
  if (!changed) return url

  return (url.slice(0, queryStart + 1) + maskedParams.join('&') + url.slice(queryEnd)) as T
}

function maskQuery(query: object): object {
  const names = SECRET_QUERY_PARAMS.filter((name) => Object.prototype.hasOwnProperty.call(query, name))
  if (names.length === 0) return query

  const masked: Record<string, unknown> = { ...query }
  for (const name of names) {
    masked[name] = CENSOR
  }
  return masked
}

function decodeName(name: string): string {
  try {
    return decodeURIComponent(name.replace(/\+/g, ' '))
  } catch {
    return name
  }
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}
