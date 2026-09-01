import { ConfigService, IdentityServiceConfig, OidcLoginConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'

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

/** The subset of the session record the interaction layer consumes. */
export interface VerificationSessionRecord {
  id: string
  state: VerificationSessionState
  errorMessage?: string
  /** Disclosed attributes extracted by heka-identity-service once `state` is `ResponseVerified`. */
  sharedAttributes?: Record<string, unknown>
}

/**
 * Client for heka-identity-service's verification-session API (INTEGRATION.md
 * §3, P1.6): `POST /openid4vc/verification-session/request` + `GET
 * /openid4vc/verification-session/:id`.
 *
 * P1.6.1 — signed authorization requests (JAR) from day one: every session is
 * created with a `requestSigner` (`IDENTITY_SERVICE_REQUEST_SIGNER_DID`), so
 * the wallet fetches the request by `request_uri` as a signed JAR (feasibility
 * §3.3 step 6). There is deliberately **no unsigned fallback** — the identity
 * service itself rejects signerless non-DC-API sessions, and this client fails
 * fast on missing configuration instead of degrading. The `x509_san_dns`
 * client-id scheme upgrade stays in Phase 3 (P3.1).
 *
 * Response mode is plain `direct_post` in Phase 1 (P1.6.2); `direct_post.jwt`
 * lands with HAIP (P3.1).
 */
@Injectable()
export class VerificationSessionClient {
  private readonly logger = new Logger(VerificationSessionClient.name)
  private readonly config: IdentityServiceConfig

  public constructor(configService: ConfigService) {
    this.config = configService.oidcConfig.identityService
  }

  public async createSignedRequest(loginConfig: OidcLoginConfig): Promise<CreatedVerificationSession> {
    const { publicVerifierId, requestSignerDid } = this.config
    if (!publicVerifierId || !requestSignerDid) {
      throw new Error(
        'IDENTITY_SERVICE_PUBLIC_VERIFIER_ID and IDENTITY_SERVICE_REQUEST_SIGNER_DID must be configured — ' +
          'authorization requests are always signed (JAR, P1.6.1), there is no unsigned fallback',
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
      // JAR, always (P1.6.1)
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

  public async getSession(sessionId: string): Promise<VerificationSessionRecord> {
    return await this.request<VerificationSessionRecord>(
      'GET',
      `/openid4vc/verification-session/${encodeURIComponent(sessionId)}`,
    )
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body && { 'content-type': 'application/json' }),
        ...(this.config.authToken && { authorization: `Bearer ${this.config.authToken}` }),
      },
      ...(body && { body: JSON.stringify(body) }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`identity-service ${method} ${path} failed: ${response.status} ${detail.slice(0, 500)}`)
    }
    return (await response.json()) as T
  }
}
