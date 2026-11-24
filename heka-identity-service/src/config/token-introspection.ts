import { registerAs } from '@nestjs/config'

import { isProductionNodeEnv } from './insecure-defaults'

export const introspectionClientAuthMethods = ['client_secret_basic', 'client_secret_post'] as const
export type IntrospectionClientAuthMethod = (typeof introspectionClientAuthMethods)[number]

/**
 * Optional OAuth 2.0 Token Introspection (RFC 7662): every bearer token that passed signature verification
 * is also checked at the OIDC provider, so that tokens revoked there (logout, ended session, admin revocation)
 * are rejected before they expire. Disabled by default: tokens are then verified statelessly
 * (signature, `iss`, `aud`, `exp`) and no outbound call is made per request.
 */
export interface TokenIntrospectionConfig {
  enabled: boolean
  /** Introspection endpoint; when unset it is taken from the provider's discovery document. */
  url?: string
  /**
   * Confidential client the service authenticates with at the introspection endpoint.
   * Keycloak only answers for tokens whose audience contains this client, i.e. the `OIDC_AUDIENCE` client.
   */
  clientId?: string
  clientSecret?: string
  /** How the client authenticates at the introspection endpoint. */
  clientAuthMethod: IntrospectionClientAuthMethod
  /** Deadline for one introspection or discovery request. When it is exceeded the token is rejected (fail closed). */
  timeoutMs: number
  /**
   * True in production (any `NODE_ENV` other than unset, `development` or `test`): the introspection endpoint (configured or discovered) and the issuer used for discovery
   * must be https, because bearer tokens and client credentials are sent there.
   */
  requireHttps: boolean
}

export const tokenIntrospectionConfigDefaults = {
  clientAuthMethod: 'client_secret_basic' as IntrospectionClientAuthMethod,
  timeoutMs: 3000,
}

/** Dev-only secret of the `heka-identity-service` client in `heka-sso-service/keycloak/realm-heka-platform.json`. */
export const knownIntrospectionDevSecret = 'dev-only-heka-identity-service-secret-do-not-use-in-production'

const MIN_PRODUCTION_SECRET_LENGTH = 16

/** True for a parseable https URL (protocol compared case-insensitively by the URL parser). */
export const isHttpsUrl = (value: string | undefined): boolean => {
  if (!value) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const text = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export default registerAs('tokenIntrospection', (): TokenIntrospectionConfig => {
  const problems: string[] = []
  const isProduction = isProductionNodeEnv()

  // A security switch: an unrecognised value must not silently leave the check off
  const enabledValue = text(process.env.OIDC_INTROSPECTION_ENABLED)?.toLowerCase()
  if (enabledValue !== undefined && enabledValue !== 'true' && enabledValue !== 'false') {
    problems.push('OIDC_INTROSPECTION_ENABLED must be true or false')
  }
  const enabled = enabledValue === 'true'
  const url = text(process.env.OIDC_INTROSPECTION_URL)
  const clientId = text(process.env.OIDC_INTROSPECTION_CLIENT_ID)
  const clientSecret = text(process.env.OIDC_INTROSPECTION_CLIENT_SECRET)

  if (enabled && (!clientId || !clientSecret)) {
    problems.push(
      'OIDC_INTROSPECTION_ENABLED=true requires OIDC_INTROSPECTION_CLIENT_ID and OIDC_INTROSPECTION_CLIENT_SECRET',
    )
  }

  const urlProtocol = url && URL.canParse(url) ? new URL(url).protocol : undefined
  if (url && urlProtocol !== 'http:' && urlProtocol !== 'https:') {
    problems.push('OIDC_INTROSPECTION_URL must be an http(s) URL')
  } else if (isProduction && url && urlProtocol !== 'https:') {
    problems.push('OIDC_INTROSPECTION_URL must use HTTPS in production')
  } else if (isProduction && enabled && !url && !isHttpsUrl(text(process.env.OIDC_ISSUER_URL))) {
    problems.push('OIDC_ISSUER_URL must use HTTPS in production when the introspection endpoint is discovered')
  }

  const clientAuthMethod = (text(process.env.OIDC_INTROSPECTION_CLIENT_AUTH_METHOD) ??
    tokenIntrospectionConfigDefaults.clientAuthMethod) as IntrospectionClientAuthMethod
  if (!introspectionClientAuthMethods.includes(clientAuthMethod)) {
    problems.push(`OIDC_INTROSPECTION_CLIENT_AUTH_METHOD must be one of ${introspectionClientAuthMethods.join(', ')}`)
  }

  const timeoutMs = process.env.OIDC_INTROSPECTION_TIMEOUT_MS
    ? parseInt(process.env.OIDC_INTROSPECTION_TIMEOUT_MS, 10)
    : tokenIntrospectionConfigDefaults.timeoutMs
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    problems.push('OIDC_INTROSPECTION_TIMEOUT_MS must be a positive integer (milliseconds)')
  }

  if (isProduction && enabled && clientSecret) {
    if (clientSecret === knownIntrospectionDevSecret) {
      problems.push(
        'OIDC_INTROSPECTION_CLIENT_SECRET is the dev secret from the shipped Keycloak realm; generate a real one for production',
      )
    } else if (clientSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      problems.push(
        `OIDC_INTROSPECTION_CLIENT_SECRET is too short for production (${MIN_PRODUCTION_SECRET_LENGTH}+ characters)`,
      )
    }
  }

  if (problems.length > 0) {
    throw new Error(`Token introspection configuration is invalid:\n - ${problems.join('\n - ')}`)
  }

  return { enabled, url, clientId, clientSecret, clientAuthMethod, timeoutMs, requireHttps: isProduction }
})
