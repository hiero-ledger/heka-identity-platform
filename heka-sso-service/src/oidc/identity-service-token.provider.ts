import { ConfigService, IdentityServiceConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'

import { describeFetchError } from './fetch-error.util'

/** Re-acquire this many seconds before the token's `expires_in` elapses. */
const REFRESH_MARGIN_SECONDS = 60
/** Assumed lifetime when the auth service omits `expires_in`. */
const FALLBACK_EXPIRES_IN_SECONDS = 3600

/**
 * Identity-service service account: supplies the
 * bearer token for heka-identity-service API calls. Instead of a pasted static
 * JWT (which expires after heka-auth-service's `JWT_ACCESS_EXPIRY` ≈ 1h and
 * then breaks every wallet login), the bridge logs into heka-auth-service
 * lazily with its own credentials (`IDENTITY_SERVICE_AUTH_NAME` +
 * `IDENTITY_SERVICE_AUTH_PASSWORD`), caches the token, and re-acquires it
 * shortly before `expires_in`. `IDENTITY_SERVICE_AUTH_TOKEN` remains a static
 * override for tests/dev and disables the login entirely.
 */
@Injectable()
export class IdentityServiceTokenProvider {
  private readonly logger = new Logger(IdentityServiceTokenProvider.name)
  private readonly config: IdentityServiceConfig
  private cached?: { token: string; refreshAt: number }
  private inFlight?: Promise<string>

  public constructor(configService: ConfigService) {
    this.config = configService.oidcConfig.identityService
  }

  /** Whether tokens come from the service-account login (rather than the static override, or nothing). */
  public get usesLogin(): boolean {
    return !this.config.authToken && Boolean(this.config.authName && this.config.authPassword)
  }

  public async getToken(): Promise<string | undefined> {
    if (this.config.authToken) return this.config.authToken
    if (!this.usesLogin) return undefined
    if (this.cached && Date.now() < this.cached.refreshAt) return this.cached.token

    // concurrent callers share one login
    this.inFlight ??= this.login().finally(() => {
      this.inFlight = undefined
    })
    return await this.inFlight
  }

  /**
   * Drop the cached token so the next `getToken` logs in again — used by the
   * once-only retry after an unexpected 401 (e.g. the token was revoked).
   * No-op for the static override.
   */
  public invalidate(): void {
    this.cached = undefined
  }

  private async login(): Promise<string> {
    const { authServiceBaseUrl, authName, authPassword } = this.config
    let response: Response
    try {
      response = await fetch(`${authServiceBaseUrl}/api/v1/oauth/token`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ name: authName, password: authPassword }),
      })
    } catch (error) {
      // undici reports network failures as a bare "TypeError: fetch failed" — name the target and the cause
      throw new Error(`auth-service at ${authServiceBaseUrl} is unreachable: ${describeFetchError(error)}`)
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`auth-service login for service account '${authName}' failed: ${response.status} ${detail.slice(0, 500)}`)
    }

    const token = (await response.json()) as { access?: string; expires_in?: number }
    if (!token.access) {
      throw new Error(`auth-service login for service account '${authName}' returned no access token`)
    }

    const expiresIn = typeof token.expires_in === 'number' && token.expires_in > 0 ? token.expires_in : FALLBACK_EXPIRES_IN_SECONDS
    // shortly before expiry; for very short-lived tokens at least half the lifetime
    const refreshInSeconds = Math.max(expiresIn - REFRESH_MARGIN_SECONDS, expiresIn / 2)
    this.cached = { token: token.access, refreshAt: Date.now() + refreshInSeconds * 1000 }

    this.logger.log(
      `Acquired identity-service token for '${authName}' (expires_in ${expiresIn}s, re-acquire in ~${Math.round(refreshInSeconds)}s)`
    )
    return token.access
  }
}
