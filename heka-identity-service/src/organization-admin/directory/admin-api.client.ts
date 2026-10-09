import { DirectoryError } from './directory.types'

const REFRESH_MARGIN_SECONDS = 30
const FALLBACK_EXPIRES_IN_SECONDS = 60
const MAX_RATE_LIMIT_RETRIES = 5
const MAX_RETRY_DELAY_MS = 10_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * How long to wait after a 429: `Retry-After` (seconds), else Auth0's `X-RateLimit-Reset` (epoch seconds),
 * else an exponential backoff; capped so a caller never waits more than a few seconds per attempt.
 */
export function retryDelayMs(response: Pick<Response, 'headers'>, attempt: number, now = Date.now()): number {
  const retryAfter = Number(response.headers.get('retry-after'))
  const reset = Number(response.headers.get('x-ratelimit-reset'))
  const requested = retryAfter > 0 ? retryAfter * 1000 : reset > 0 ? reset * 1000 - now : 0
  const backoff = 250 * 2 ** attempt
  return Math.min(Math.max(requested, backoff), MAX_RETRY_DELAY_MS)
}

export interface AdminApiClientOptions {
  tokenUrl: string
  clientId: string
  clientSecret: string
  /** Extra form fields of the token request, e.g. Auth0's Management API `audience`. */
  tokenParams?: Record<string, string>
  /** Base URL that relative request paths are resolved against. */
  baseUrl: string
}

/**
 * JSON client for a provider admin API (Keycloak admin REST API, Auth0 Management API), authenticated with a
 * cached OAuth 2.0 Client Credentials token of the admin service account.
 */
export class AdminApiClient {
  private cached?: { accessToken: string; refreshAt: number }
  private inFlight?: Promise<string>

  public constructor(private readonly options: AdminApiClientOptions) {}

  /**
   * `undefined` for 404, the parsed JSON body otherwise (`undefined` for an empty body). A `429 Too Many Requests`
   * (Auth0's Management API rate limits are low on small plans) is retried after the wait the provider asks for.
   */
  public async request<T>(method: string, path: string, body?: unknown): Promise<T | undefined> {
    const url = `${this.options.baseUrl}${path}`
    let response: Response
    for (let attempt = 0; ; attempt++) {
      try {
        response = await fetch(url, {
          method,
          headers: {
            authorization: `Bearer ${await this.token()}`,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
      } catch (error) {
        throw new DirectoryError(`${method} ${url} failed: ${(error as Error).message}`)
      }
      if (response.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) break
      await sleep(retryDelayMs(response, attempt))
    }
    if (response.status === 404) return undefined
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new DirectoryError(`${method} ${url.split('?')[0]} failed: ${response.status} ${detail.slice(0, 300)}`)
    }
    const text = await response.text()
    return text ? (JSON.parse(text) as T) : undefined
  }

  private async token(): Promise<string> {
    if (this.cached && Date.now() < this.cached.refreshAt) return this.cached.accessToken
    this.inFlight ??= this.acquire().finally(() => {
      this.inFlight = undefined
    })
    return await this.inFlight
  }

  private async acquire(): Promise<string> {
    const { tokenUrl, clientId, clientSecret, tokenParams } = this.options
    let response: Response
    try {
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          ...tokenParams,
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      })
    } catch (error) {
      throw new DirectoryError(`token endpoint ${tokenUrl} is unreachable: ${(error as Error).message}`)
    }
    const token = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number }
    if (!response.ok || !token.access_token) {
      throw new DirectoryError(`client credentials grant for '${clientId}' at ${tokenUrl} failed: ${response.status}`)
    }
    const expiresIn = token.expires_in && token.expires_in > 0 ? token.expires_in : FALLBACK_EXPIRES_IN_SECONDS
    this.cached = {
      accessToken: token.access_token,
      refreshAt: Date.now() + Math.max(expiresIn - REFRESH_MARGIN_SECONDS, expiresIn / 2) * 1000,
    }
    return token.access_token
  }
}
