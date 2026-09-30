import { ConfigService, IdentityServiceConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'

import { describeFetchError } from './fetch-error.util'

const REFRESH_MARGIN_SECONDS = 60
const FALLBACK_EXPIRES_IN_SECONDS = 3600

interface TokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
}

/**
 * Supplies the bearer token for heka-identity-service API calls.
 *
 * Either a static token (`IDENTITY_SERVICE_AUTH_TOKEN`, tests/dev) or an OAuth 2.0 Client Credentials
 * grant (RFC 6749 section 4.4) against the OIDC provider that heka-identity-service trusts — Keycloak,
 * Auth0, or any other — using the confidential client configured with `IDENTITY_SERVICE_TOKEN_URL`,
 * `IDENTITY_SERVICE_CLIENT_ID` and `IDENTITY_SERVICE_CLIENT_SECRET`. The token is cached and re-acquired
 * shortly before `expires_in` elapses.
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

  /** True when the provider acquires tokens itself (Client Credentials) rather than using a static token. */
  public get usesLogin(): boolean {
    return this.config.usesClientCredentials
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
    const { tokenUrl, clientId, clientSecret, clientAuthMethod, tokenParams } = this.config
    if (!tokenUrl || !clientId || !clientSecret) {
      throw new Error('identity-service client credentials are not configured')
    }

    const body = new URLSearchParams({ ...tokenParams, grant_type: 'client_credentials' })
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    }
    if (clientAuthMethod === 'client_secret_basic') {
      // RFC 6749 section 2.3.1: credentials are form-urlencoded before being base64-encoded.
      const credentials = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`
      headers.authorization = `Basic ${Buffer.from(credentials).toString('base64')}`
    } else {
      body.set('client_id', clientId)
      body.set('client_secret', clientSecret)
    }

    let response: Response
    try {
      response = await fetch(tokenUrl, { method: 'POST', headers, body: body.toString() })
    } catch (error) {
      throw new Error(`token endpoint ${tokenUrl} is unreachable: ${describeFetchError(error)}`)
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`client credentials grant for '${clientId}' at ${tokenUrl} failed: ${response.status} ${detail.slice(0, 500)}`)
    }

    const token = (await response.json()) as TokenResponse
    if (!token.access_token) {
      throw new Error(`client credentials grant for '${clientId}' at ${tokenUrl} returned no access token`)
    }
    if (token.token_type && token.token_type.toLowerCase() !== 'bearer') {
      this.logger.warn(`token endpoint ${tokenUrl} returned token_type '${token.token_type}', expected Bearer`)
    }

    const expiresIn = typeof token.expires_in === 'number' && token.expires_in > 0 ? token.expires_in : FALLBACK_EXPIRES_IN_SECONDS
    const refreshInSeconds = Math.max(expiresIn - REFRESH_MARGIN_SECONDS, expiresIn / 2)
    this.cached = { token: token.access_token, refreshAt: Date.now() + refreshInSeconds * 1000 }

    this.logger.log(
      `Acquired identity-service token for client '${clientId}' (expires_in ${expiresIn}s, re-acquire in ~${Math.round(refreshInSeconds)}s)`
    )
    return token.access_token
  }
}
