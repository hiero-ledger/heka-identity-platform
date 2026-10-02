import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { InjectLogger, Logger } from 'common/logger'
import DemoConfig from 'config/demo'

/** Re-acquire this long before the token expires so the browser never receives an almost-expired token. */
const REFRESH_MARGIN_SECONDS = 60
const FALLBACK_EXPIRES_IN_SECONDS = 300

interface TokenEndpointResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
}

export interface DemoToken {
  accessToken: string
  /** Epoch milliseconds at which the provider expires the token. */
  expiresAt: number
}

/**
 * Obtains and caches the demo service account's access token with an OAuth 2.0 Client Credentials
 * grant (RFC 6749 section 4.4) against the provider configured with `DEMO_TOKEN_URL`, `DEMO_CLIENT_ID`
 * and `DEMO_CLIENT_SECRET`. One token is shared by every caller of `GET /demo/token` and re-acquired
 * shortly before `expires_in` elapses, so the provider sees one grant per token lifetime regardless
 * of how many browsers open the demo pages.
 */
@Injectable()
export class DemoTokenProvider implements OnModuleInit {
  private cached?: DemoToken & { refreshAt: number }
  private inFlight?: Promise<DemoToken>

  public constructor(
    @Inject(DemoConfig.KEY)
    private readonly config: ConfigType<typeof DemoConfig>,
    @InjectLogger(DemoTokenProvider)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public onModuleInit(): void {
    const logger = this.logger.child('onModuleInit')
    if (this.config.enabled) {
      logger.info(
        {
          tokenUrl: this.config.tokenUrl,
          clientId: this.config.clientId,
          clientAuthMethod: this.config.clientAuthMethod,
          tokenParams: Object.keys(this.config.tokenParams),
          rateLimit: this.config.rateLimit,
        },
        'Demo token broker enabled: GET /demo/token hands out the demo service account token',
      )
    } else {
      logger.info('Demo token broker disabled (set DEMO_TOKEN_URL, DEMO_CLIENT_ID and DEMO_CLIENT_SECRET to enable it)')
    }
  }

  public get enabled(): boolean {
    return this.config.enabled
  }

  /** The cached token, or a freshly acquired one when there is none or it is about to expire. */
  public async getToken(): Promise<DemoToken> {
    if (!this.config.enabled) {
      throw new Error('demo token broker is not enabled')
    }
    if (this.cached && Date.now() < this.cached.refreshAt) {
      return { accessToken: this.cached.accessToken, expiresAt: this.cached.expiresAt }
    }

    this.inFlight ??= this.acquire().finally(() => {
      this.inFlight = undefined
    })
    return await this.inFlight
  }

  public invalidate(): void {
    this.cached = undefined
  }

  private async acquire(): Promise<DemoToken> {
    const logger = this.logger.child('acquire')
    const { tokenUrl, clientId, clientSecret, clientAuthMethod, tokenParams } = this.config
    if (!tokenUrl || !clientId || !clientSecret) {
      throw new Error('demo client credentials are not configured')
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
      throw new Error(`token endpoint ${tokenUrl} is unreachable: ${describeError(error)}`, { cause: error })
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `client credentials grant for '${clientId}' at ${tokenUrl} failed: ${response.status} ${detail.slice(0, 500)}`,
      )
    }

    const token = (await response.json()) as TokenEndpointResponse
    if (!token.access_token) {
      throw new Error(`client credentials grant for '${clientId}' at ${tokenUrl} returned no access token`)
    }
    if (token.token_type && token.token_type.toLowerCase() !== 'bearer') {
      logger.warn(`token endpoint ${tokenUrl} returned token_type '${token.token_type}', expected Bearer`)
    }

    const expiresIn =
      typeof token.expires_in === 'number' && token.expires_in > 0 ? token.expires_in : FALLBACK_EXPIRES_IN_SECONDS
    const refreshInSeconds = Math.max(expiresIn - REFRESH_MARGIN_SECONDS, expiresIn / 2)
    const now = Date.now()
    this.cached = {
      accessToken: token.access_token,
      expiresAt: now + expiresIn * 1000,
      refreshAt: now + refreshInSeconds * 1000,
    }

    logger.info(
      `Acquired demo token for client '${clientId}' (expires_in ${expiresIn}s, re-acquire in ~${Math.round(refreshInSeconds)}s)`,
    )
    return { accessToken: this.cached.accessToken, expiresAt: this.cached.expiresAt }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    const causeText = cause instanceof Error ? ` (${cause.message})` : ''
    return `${error.message}${causeText}`
  }
  return String(error)
}
