import { ConfigService, IdentityServiceConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'

import { describeFetchError } from './fetch-error.util'

const REFRESH_MARGIN_SECONDS = 60
const FALLBACK_EXPIRES_IN_SECONDS = 3600

/**
 * Identity-service service account: supplies the bearer token for heka-identity-service API calls.
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

  public get usesLogin(): boolean {
    return !this.config.authToken && Boolean(this.config.authName && this.config.authPassword)
  }

  public async getToken(): Promise<string | undefined> {
    if (this.config.authToken) return this.config.authToken
    if (!this.usesLogin) return undefined
    if (this.cached && Date.now() < this.cached.refreshAt) return this.cached.token

    this.inFlight ??= this.login().finally(() => {
      this.inFlight = undefined
    })
    return await this.inFlight
  }

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
    const refreshInSeconds = Math.max(expiresIn - REFRESH_MARGIN_SECONDS, expiresIn / 2)
    this.cached = { token: token.access, refreshAt: Date.now() + refreshInSeconds * 1000 }

    this.logger.log(
      `Acquired identity-service token for '${authName}' (expires_in ${expiresIn}s, re-acquire in ~${Math.round(refreshInSeconds)}s)`
    )
    return token.access
  }
}
