import { Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { InjectLogger, Logger } from 'common/logger'
import OidcConfig from 'config/oidc'
import TokenIntrospectionConfig, { isHttpsUrl } from 'config/token-introspection'

const DISCOVERY_PATH = '/.well-known/openid-configuration'

interface DiscoveryDocument {
  issuer?: string
  introspection_endpoint?: string
}

/**
 * Asks the OIDC provider whether a bearer token is still active (OAuth 2.0 Token Introspection, RFC 7662),
 * so that tokens revoked there (logout, ended session, admin revocation) are rejected before they expire.
 *
 * No-op unless `OIDC_INTROSPECTION_ENABLED=true`. When enabled the check fails closed: any answer other than
 * an explicit `{"active": true}` (inactive, 401/403, 429, 5xx, redirect, timeout, network error,
 * malformed response) rejects the token. The token and the client secret are never logged.
 */
@Injectable()
export class TokenIntrospectionService implements OnModuleInit {
  private endpoint?: string
  private endpointPromise?: Promise<string>

  public constructor(
    @Inject(TokenIntrospectionConfig.KEY)
    private readonly config: ConfigType<typeof TokenIntrospectionConfig>,
    @Inject(OidcConfig.KEY)
    private readonly oidcConfig: ConfigType<typeof OidcConfig>,
    @InjectLogger(TokenIntrospectionService)
    private readonly logger: Logger,
  ) {
    this.endpoint = config.url
  }

  public onModuleInit(): void {
    const logger = this.logger.child('onModuleInit')
    if (this.config.enabled) {
      logger.info(
        {
          endpoint: this.config.url ?? 'discovery',
          clientId: this.config.clientId,
          clientAuthMethod: this.config.clientAuthMethod,
          timeoutMs: this.config.timeoutMs,
        },
        'Token introspection enabled: every bearer token is checked at the OIDC provider',
      )
    } else {
      logger.info('Token introspection disabled (set OIDC_INTROSPECTION_ENABLED=true to reject revoked tokens)')
    }
  }

  /** Throws `UnauthorizedException` unless the provider reports the token as active. */
  public async assertTokenActive(token: string): Promise<void> {
    if (!this.config.enabled) return

    const logger = this.logger.child('assertTokenActive')
    logger.trace('>')

    const { clientId, clientSecret, clientAuthMethod, timeoutMs } = this.config
    if (!clientId || !clientSecret) {
      // Unreachable: the config factory refuses to start without client credentials when introspection is enabled.
      throw new Error('token introspection is enabled but no client credentials are configured')
    }

    const endpoint = await this.getEndpoint()

    const body = new URLSearchParams({ token, token_type_hint: 'access_token' })
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
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: body.toString(),
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      logger.warn({ error: errorForLog(error) }, 'Token introspection failed: the endpoint is unreachable or timed out')
      throw new UnauthorizedException()
    }

    if (response.status === 200) {
      const result: unknown = await response.json().catch(() => undefined)
      if (isIntrospectionResult(result)) {
        if (result.active) {
          logger.trace('< active')
          return
        }
        logger.debug('Token rejected: the provider reports it as inactive (revoked, expired or unknown)')
        throw new UnauthorizedException('Token is not active')
      }
      logger.warn('Token introspection failed: malformed response')
      throw new UnauthorizedException()
    }

    await discardBody(response)

    // RFC 7662 answers a bad token with 200 {active: false}, so 400 (RFC 6749 invalid_client), 401 and 403 all point
    // at the service's own request or client credentials
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      logger.error(
        { status: response.status, clientId },
        'Token introspection failed: the provider rejected the client credentials (check OIDC_INTROSPECTION_CLIENT_ID and OIDC_INTROSPECTION_CLIENT_SECRET)',
      )
      // A server misconfiguration, not a bad token: still fail closed, but as a server error like a failed discovery
      throw new Error(
        `token introspection was refused: the provider rejected client '${clientId}' (HTTP ${response.status})`,
      )
    }

    logger.warn({ status: response.status }, 'Token introspection failed: unexpected response')
    throw new UnauthorizedException()
  }

  private async getEndpoint(): Promise<string> {
    if (this.endpoint) {
      return this.endpoint
    }

    this.endpointPromise ??= this.discoverEndpoint()
      .then((endpoint) => {
        this.endpoint = endpoint
        return endpoint
      })
      .finally(() => {
        this.endpointPromise = undefined
      })

    return this.endpointPromise
  }

  private async discoverEndpoint(): Promise<string> {
    const logger = this.logger.child('discoverEndpoint')
    const issuer = this.oidcConfig.issuerUrl ?? ''
    this.assertHttps(issuer, 'OIDC_ISSUER_URL (used for introspection endpoint discovery)')
    const url = `${issuer.replace(/\/+$/, '')}${DISCOVERY_PATH}`
    logger.debug(`Fetching OIDC discovery document from ${url}`)

    // A redirect could point discovery at another host, so redirects are treated as failures
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(this.config.timeoutMs) })
    if (!response.ok) {
      await discardBody(response)
      throw new Error(`OIDC discovery at ${url} failed: HTTP ${response.status}`)
    }

    const document = (await response.json()) as DiscoveryDocument
    // OIDC Discovery 4.3: the metadata must belong to the configured issuer before any of it is trusted
    if (document.issuer !== issuer) {
      throw new Error(`OIDC discovery at ${url} returned an unexpected issuer: ${String(document.issuer)}`)
    }

    const endpoint: unknown = document.introspection_endpoint
    if (typeof endpoint !== 'string' || !endpoint) {
      throw new Error(
        `OIDC discovery at ${url} returned no introspection_endpoint; set OIDC_INTROSPECTION_URL or disable OIDC_INTROSPECTION_ENABLED`,
      )
    }

    if (!URL.canParse(endpoint)) {
      throw new Error(`OIDC discovery at ${url} returned an invalid introspection_endpoint: ${endpoint}`)
    }
    this.assertHttps(endpoint, `introspection_endpoint discovered at ${url}`)

    logger.info(`Using token introspection endpoint ${endpoint}`)
    return endpoint
  }

  // Bearer tokens and client credentials are sent to the introspection endpoint, so production requires https
  private assertHttps(value: string, name: string): void {
    if (this.config.requireHttps && !isHttpsUrl(value)) {
      throw new Error(`${name} must use HTTPS in production: ${value}`)
    }
  }
}

// Release the connection of a response whose body is not read (undici holds it until the body is consumed)
async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}

function isIntrospectionResult(data: unknown): data is { active: boolean } {
  return typeof data === 'object' && data !== null && typeof (data as { active?: unknown }).active === 'boolean'
}

// Log only diagnostic fields: a request error may carry the request, including the Authorization header.
function errorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const cause = error.cause as NodeJS.ErrnoException | undefined
    return { name: error.name, code: cause?.code ?? (error as NodeJS.ErrnoException).code }
  }
  return { type: typeof error }
}
