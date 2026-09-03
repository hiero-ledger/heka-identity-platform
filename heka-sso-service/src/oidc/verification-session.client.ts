import { ConfigService, IdentityServiceConfig, OidcLoginConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'

import { describeFetchError } from './fetch-error.util'
import { IdentityServiceTokenProvider } from './identity-service-token.provider'

export enum VerificationSessionState {
  RequestCreated = 'RequestCreated',
  RequestUriRetrieved = 'RequestUriRetrieved',
  ResponseVerified = 'ResponseVerified',
  Error = 'Error',
}

export interface CreatedVerificationSession {
  sessionId: string
  authorizationRequest: string
}

export interface CreatedDcApiVerificationSession {
  sessionId: string
  protocol: 'openid4vp-v1-signed' | 'openid4vp-v1-unsigned'
  authorizationRequestObject: Record<string, unknown>
}

export interface VerificationSessionRecord {
  id: string
  state: VerificationSessionState
  errorMessage?: string
  sharedAttributes?: Record<string, unknown>
}

@Injectable()
export class VerificationSessionClient {
  private readonly logger = new Logger(VerificationSessionClient.name)
  private readonly config: IdentityServiceConfig

  public constructor(
    configService: ConfigService,
    private readonly tokenProvider: IdentityServiceTokenProvider
  ) {
    this.config = configService.oidcConfig.identityService
  }

  public async createSignedRequest(loginConfig: OidcLoginConfig): Promise<CreatedVerificationSession> {
    const { publicVerifierId, requestSignerDid } = this.config
    if (!publicVerifierId || !requestSignerDid) {
      throw new Error(
        'IDENTITY_SERVICE_PUBLIC_VERIFIER_ID and IDENTITY_SERVICE_REQUEST_SIGNER_DID must be configured — ' +
          'authorization requests are always signed, there is no unsigned fallback'
      )
    }
    if (!loginConfig.dcqlQuery) {
      throw new Error(`login configuration '${loginConfig.id}' has no DCQL query (dcqlQuery) — nothing to request from the wallet`)
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

    this.logger.log(`Created verification session ${response.verificationSession.id} (login config '${loginConfig.id}')`)
    return {
      sessionId: response.verificationSession.id,
      authorizationRequest: response.authorizationRequest,
    }
  }

  public async createDcApiRequest(loginConfig: OidcLoginConfig, origin: string): Promise<CreatedDcApiVerificationSession> {
    const { publicVerifierId, requestSignerDid } = this.config
    if (!publicVerifierId || !requestSignerDid) {
      throw new Error(
        'IDENTITY_SERVICE_PUBLIC_VERIFIER_ID and IDENTITY_SERVICE_REQUEST_SIGNER_DID must be configured — ' +
          'DC API authorization requests are signed like every other session'
      )
    }
    if (!loginConfig.dcqlQuery) {
      throw new Error(`login configuration '${loginConfig.id}' has no DCQL query (dcqlQuery) — nothing to request from the wallet`)
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
      expectedOrigins: [origin],
    })

    const requestObject = response.authorizationRequestObject
    if (!requestObject) {
      throw new Error('identity-service returned no authorizationRequestObject for the dc_api session')
    }

    this.logger.log(`Created DC API verification session ${response.verificationSession.id} (login config '${loginConfig.id}')`)
    return {
      sessionId: response.verificationSession.id,
      protocol: 'request' in requestObject || 'payload' in requestObject ? 'openid4vp-v1-signed' : 'openid4vp-v1-unsigned',
      authorizationRequestObject: requestObject,
    }
  }

  public async verifyDcApiResponse(
    sessionId: string,
    authorizationResponse: Record<string, unknown>,
    origin: string
  ): Promise<VerificationSessionRecord> {
    return await this.request<VerificationSessionRecord>(
      'POST',
      `/openid4vc/verification-session/${encodeURIComponent(sessionId)}/verify`,
      { authorizationResponse, origin }
    )
  }

  public async getSession(sessionId: string): Promise<VerificationSessionRecord> {
    return await this.request<VerificationSessionRecord>('GET', `/openid4vc/verification-session/${encodeURIComponent(sessionId)}`)
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
    let response = await this.send(method, path, body)

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
      throw new Error(`identity-service at ${this.config.baseUrl} is unreachable: ${describeFetchError(error)}`)
    }
  }
}
