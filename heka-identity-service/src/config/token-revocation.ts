import { registerAs } from '@nestjs/config'

const DEFAULT_TIMEOUT_MS = 3_000

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Opt-in check of every incoming access token against Heka Auth Service, so that tokens revoked there
 * (logout, refresh) are rejected here too. Disabled by default: tokens are then validated statelessly
 * (signature, `iss`, `aud`, `exp`) and no outbound call is made.
 */
export default registerAs('tokenRevocation', () => {
  const enabled = process.env.JWT_REVOCATION_CHECK_ENABLED === 'true'
  const url = process.env.JWT_REVOCATION_CHECK_URL || undefined

  if (enabled) {
    if (!url) {
      throw new Error(
        'JWT_REVOCATION_CHECK_ENABLED=true requires JWT_REVOCATION_CHECK_URL (the Auth Service introspection endpoint, e.g. http://localhost:3004/api/v1/oauth/introspect)',
      )
    }
    let protocol: string
    try {
      protocol = new URL(url).protocol
    } catch {
      throw new Error('JWT_REVOCATION_CHECK_URL is not a valid URL')
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new Error('JWT_REVOCATION_CHECK_URL must use http: or https:')
    }
  }

  return {
    enabled,
    url,
    // Deadline for a single introspection call. When it is exceeded the request is rejected (fail closed).
    timeoutMs: parsePositiveInt(process.env.JWT_REVOCATION_CHECK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  }
})
