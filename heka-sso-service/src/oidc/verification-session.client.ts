import { ConfigService, IdentityServiceConfig, OidcLoginConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'

import { describeFetchError } from './fetch-error.util'
import { IdentityServiceTokenProvider } from './identity-service-token.provider'

/** Mirror of Credo's `OpenId4VcVerificationSessionState` (heka-identity-service session records). */
export enum VerificationSessionState {
  RequestCreated = 'RequestCreated',
  RequestUriRetrieved = 'RequestUriRetrieved',
  ResponseVerified = 'ResponseVerified',
  Error = 'Error',
}

/** Result of creating a verification session — what the login page needs for the QR / deep link. */
export interface CreatedVerificationSession {
  sessionId: string
  /** Wallet-facing authorization request URI (`openid4vp://?request_uri=…`) — QR / deep-link target. */
  authorizationRequest: string
}

/** Result of creating a DC API verification session — what `navigator.credentials.get()` needs. */
export interface CreatedDcApiVerificationSession {
  sessionId: string
  /** DC API protocol identifier matching the request object (signed requests carry the JAR). */
  protocol: 'openid4vp-v1-signed' | 'openid4vp-v1-unsigned'
  /** The authorization request object passed as `data` of the DC API request. */
  authorizationRequestObject: Record<string, unknown>
}

/** The subset of the session record the interaction layer consumes. */
export interface VerificationSessionRecord {
  id: string
  state: VerificationSessionState
  errorMessage?: string
  /** Disclosed attributes extracted by heka-identity-service once `state` is `ResponseVerified`. */
  sharedAttributes?: Record<string, unknown>
}

/**
 * Client for heka-identity-service's verification-session API:
 * `POST /openid4vc/verification-session/request` + `GET /openid4vc/verification-session/:id`.
 *
 * signed authorization requests (JAR) from day one: every session is
 * created with a `requestSigner` (`IDENTITY_SERVICE_REQUEST_SIGNER_DID`), so
 * the wallet fetches the request by `request_uri` as a signed JAR.
 * There is deliberately **no unsigned fallback** — the identity
 * service itself rejects signerless non-DC-API sessions, and this client fails
 * fast on missing configuration instead of degrading.
 *
 * Response mode is plain `direct_post`; `direct_post.jwt`
 * lands with HAIP. The DC API same-device flow uses separate
 * sessions with `responseMode: 'dc_api'`, verified through the origin-bound
 * `verify` endpoint.
 *
 * Authentication: the bearer token comes from
 * `IdentityServiceTokenProvider` — a self-refreshing service-account login
 * against heka-auth-service, with `IDENTITY_SERVICE_AUTH_TOKEN` as a static
 * override for tests/dev. An unexpected 401 on a service-account token drops
 * the cache and retries the call once with a freshly acquired token.
 */
@Injectable()
export class VerificationSessionClient {
  private readonly logger = new Logger(VerificationSessionClient.name)
  private readonly config: IdentityServiceConfig

  public constructor(
    configService: ConfigService,
    private readonly tokenProvider: IdentityServiceTokenProvider,
  ) {
    this.config = configService.oidcConfig.identityService
  }

  public async createSignedRequest(loginConfig: OidcLoginConfig): Promise<CreatedVerificationSession> {
    const { publicVerifierId, requestSignerDid } = this.config
    if (!publicVerifierId || !requestSignerDid) {
      throw new Error(
        'IDENTITY_SERVICE_PUBLIC_VERIFIER_ID and IDENTITY_SERVICE_REQUEST_SIGNER_DID must be configured — ' +
          'authorization requests are always signed, there is no unsigned fallback',
      )
    }
    if (!loginConfig.dcqlQuery) {
      throw new Error(
        `login configuration '${loginConfig.id}' has no DCQL query (dcqlQuery) — nothing to request from the wallet`,
      )
    }

    const response = await this.request<{
      verificationSession: { id: string }
      authorizationRequest: string
    }>('POST', '/openid4vc/verification-session/request', {
      publicVerifierId,
      requestSigner: { method: 'did', did: requestSignerDid },
      dcql: { query: loginConfig.dcqlQuery },
      responseMode: 'direct_post',
      version: 'v1',
    })

    this.logger.log(
      `Created verification session ${response.verificationSession.id} (login config '${loginConfig.id}')`,
    )
    return {
      sessionId: response.verificationSession.id,
      authorizationRequest: response.authorizationRequest,
    }
  }

  /**
   * DC API same-device flow: create a verification session whose
   * response comes back through the browser (`responseMode: 'dc_api'`) instead
   * of the wallet's `direct_post`. The request is signed like every other
   * session (current wallet matchers require it — see
   * heka-identity-service/docs/dc-api.md) and bound to the bridge's own origin
   * via `expectedOrigins`; the identity service returns the
   * `authorizationRequestObject` to pass into `navigator.credentials.get()`.
   */
  public async createDcApiRequest(
    loginConfig: OidcLoginConfig,
    origin: string,
  ): Promise<CreatedDcApiVerificationSession> {
    const { publicVerifierId, requestSignerDid } = this.config
    if (!publicVerifierId || !requestSignerDid) {
      throw new Error(
        'IDENTITY_SERVICE_PUBLIC_VERIFIER_ID and IDENTITY_SERVICE_REQUEST_SIGNER_DID must be configured — ' +
          'DC API authorization requests are signed like every other session',
      )
    }
    if (!loginConfig.dcqlQuery) {
      throw new Error(
        `login configuration '${loginConfig.id}' has no DCQL query (dcqlQuery) — nothing to request from the wallet`,
      )
    }

    const response = await this.request<{
      verificationSession: { id: string }
      authorizationRequestObject?: Record<string, unknown>
    }>('POST', '/openid4vc/verification-session/request', {
      publicVerifierId,
      requestSigner: { method: 'did', did: requestSignerDid },
      dcql: { query: loginConfig.dcqlQuery },
      responseMode: 'dc_api',
      version: 'v1',
      // binds the calling page (the bridge-served login page) into the signed request
      expectedOrigins: [origin],
    })

    const requestObject = response.authorizationRequestObject
    if (!requestObject) {
      throw new Error('identity-service returned no authorizationRequestObject for the dc_api session')
    }

    this.logger.log(
      `Created DC API verification session ${response.verificationSession.id} (login config '${loginConfig.id}')`,
    )
    return {
      sessionId: response.verificationSession.id,
      // a signed request object carries the JAR ({ request: "<jwt>" }); unsigned carries the bare params
      protocol:
        'request' in requestObject || 'payload' in requestObject ? 'openid4vp-v1-signed' : 'openid4vp-v1-unsigned',
      authorizationRequestObject: requestObject,
    }
  }

  /**
   * forward the wallet's DC API response (the parsed
   * `DigitalCredential.data` the browser hands back) to the identity service's
   * origin-bound `verify` endpoint. On success the returned record is already
   * `ResponseVerified` and carries the disclosed `sharedAttributes`.
   */
  public async verifyDcApiResponse(
    sessionId: string,
    authorizationResponse: Record<string, unknown>,
    origin: string,
  ): Promise<VerificationSessionRecord> {
    return await this.request<VerificationSessionRecord>(
      'POST',
      `/openid4vc/verification-session/${encodeURIComponent(sessionId)}/verify`,
      { authorizationResponse, origin },
    )
  }

  public async getSession(sessionId: string): Promise<VerificationSessionRecord> {
    return await this.request<VerificationSessionRecord>(
      'GET',
      `/openid4vc/verification-session/${encodeURIComponent(sessionId)}`,
    )
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
    let response = await this.send(method, path, body)

    // a service-account token may have been revoked or expired early —
    // re-acquire once and retry; a second 401 surfaces as a normal failure
    if (response.status === 401 && this.tokenProvider.usesLogin) {
      this.logger.warn(`identity-service ${method} ${path} returned 401 — re-acquiring the service-account token`)
      this.tokenProvider.invalidate()
      response = await this.send(method, path, body)
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`identity-service ${method} ${path} failed: ${response.status} ${detail.slice(0, 500)}`)
    }
    return (await response.json()) as T
  }

  private async send(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<Response> {
    const token = await this.tokenProvider.getToken()
    try {
      return await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body && { 'content-type': 'application/json' }),
          ...(token && { authorization: `Bearer ${token}` }),
        },
        ...(body && { body: JSON.stringify(body) }),
      })
    } catch (error) {
      // undici reports network failures as a bare "TypeError: fetch failed" — name the target and the cause
      throw new Error(`identity-service at ${this.config.baseUrl} is unreachable: ${describeFetchError(error)}`)
    }
  }
}
