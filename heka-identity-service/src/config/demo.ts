import { registerAs } from '@nestjs/config'

export const demoClientAuthMethods = ['client_secret_post', 'client_secret_basic'] as const
export type DemoClientAuthMethod = (typeof demoClientAuthMethods)[number]

/**
 * Demo-token broker: `GET /demo/token` hands the public demo pages a short-lived access token
 * of a dedicated demo service account, obtained with an OAuth 2.0 Client Credentials grant
 * from the same OIDC provider that issues the tokens this service accepts.
 * Disabled unless the token URL, client id and client secret are all set.
 */
export interface DemoConfig {
  /** True when `tokenUrl`, `clientId` and `clientSecret` are all set. */
  enabled: boolean
  /** Provider token endpoint, e.g. `http://localhost:8080/realms/heka-platform/protocol/openid-connect/token`. */
  tokenUrl?: string
  /** Confidential client with a service account that carries the demo tenant's claims. */
  clientId?: string
  clientSecret?: string
  /** How the client authenticates at the token endpoint. */
  clientAuthMethod: DemoClientAuthMethod
  /** Extra form fields for the token request, e.g. `{"audience":"https://heka-identity"}` for Auth0. */
  tokenParams: Record<string, string>
  /** Requests per minute per client IP accepted by `GET /demo/token`. */
  rateLimit: number
}

export const demoConfigDefaults = {
  clientAuthMethod: 'client_secret_post' as DemoClientAuthMethod,
  rateLimit: 30,
}

/** Dev-only secret of the `heka-demo` client in `heka-sso-service/keycloak/realm-heka-platform.json`. */
export const knownDemoDevSecret = 'dev-only-heka-demo-secret-do-not-use-in-production'

const MIN_PRODUCTION_SECRET_LENGTH = 16

const text = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const parseTokenParams = (raw: string | undefined, problems: string[]): Record<string, string> => {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    problems.push('DEMO_TOKEN_PARAMS contains invalid JSON')
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    problems.push('DEMO_TOKEN_PARAMS must be a JSON object of form fields')
    return {}
  }
  const params: Record<string, string> = {}
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      problems.push(`DEMO_TOKEN_PARAMS: value of '${name}' must be a string`)
      continue
    }
    params[name] = String(value)
  }
  return params
}

export default registerAs('demo', (): DemoConfig => {
  const problems: string[] = []
  const isProduction = process.env.NODE_ENV?.toLowerCase() === 'production'

  const tokenUrl = text(process.env.DEMO_TOKEN_URL)
  const clientId = text(process.env.DEMO_CLIENT_ID)
  const clientSecret = text(process.env.DEMO_CLIENT_SECRET)

  const settings = { DEMO_TOKEN_URL: tokenUrl, DEMO_CLIENT_ID: clientId, DEMO_CLIENT_SECRET: clientSecret }
  const missing = Object.entries(settings)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (missing.length > 0 && missing.length < Object.keys(settings).length) {
    problems.push(`${Object.keys(settings).join(', ')} must be set together (missing: ${missing.join(', ')})`)
  }
  const enabled = missing.length === 0

  if (enabled && tokenUrl && !/^https?:\/\//.test(tokenUrl)) {
    problems.push('DEMO_TOKEN_URL must be an http(s) URL')
  }

  const clientAuthMethod = (text(process.env.DEMO_CLIENT_AUTH_METHOD) ??
    demoConfigDefaults.clientAuthMethod) as DemoClientAuthMethod
  if (!demoClientAuthMethods.includes(clientAuthMethod)) {
    problems.push(`DEMO_CLIENT_AUTH_METHOD must be one of ${demoClientAuthMethods.join(', ')}`)
  }

  const tokenParams = parseTokenParams(text(process.env.DEMO_TOKEN_PARAMS), problems)

  const rateLimit = process.env.DEMO_TOKEN_RATE_LIMIT
    ? parseInt(process.env.DEMO_TOKEN_RATE_LIMIT, 10)
    : demoConfigDefaults.rateLimit
  if (!Number.isInteger(rateLimit) || rateLimit < 1) {
    problems.push('DEMO_TOKEN_RATE_LIMIT must be a positive integer (requests per minute per IP)')
  }

  if (isProduction && clientSecret) {
    if (clientSecret === knownDemoDevSecret) {
      problems.push(
        'DEMO_CLIENT_SECRET is the dev secret from the shipped Keycloak realm; generate a real one for production',
      )
    } else if (clientSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      problems.push(`DEMO_CLIENT_SECRET is too short for production (${MIN_PRODUCTION_SECRET_LENGTH}+ characters)`)
    }
  }

  if (problems.length > 0) {
    throw new Error(`Demo token broker configuration is invalid:\n - ${problems.join('\n - ')}`)
  }

  return { enabled, tokenUrl, clientId, clientSecret, clientAuthMethod, tokenParams, rateLimit }
})
