import { ConfigService, OidcLoginConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'
import * as QRCode from 'qrcode'

import { ClaimSet } from './claims.util'
import {
  AcquiredIdentity,
  BeginLoginResult,
  DcApiLogin,
  DcApiLoginRequest,
  DirectPostLogin,
  IdentityAcquirer,
  LoginPageData,
  LoginStatus,
} from './identity-acquirer'
import { LoginEventsService } from './login-events.service'
import { loadPage } from './pages'
import { VerificationSessionClient, VerificationSessionState } from './verification-session.client'
import { assertWalletAuthorizationRequest } from './wallet-uri'

interface PendingLogin {
  directPostSessionId?: string
  dcApiSessionId?: string
  expiresAt: number
}

@Injectable()
export class WalletIdentityAcquirer implements IdentityAcquirer, DirectPostLogin, DcApiLogin {
  private readonly logger = new Logger(WalletIdentityAcquirer.name)
  private readonly pending = new Map<string, PendingLogin>()
  private readonly ttlMs: number
  private readonly origin: string

  public constructor(
    private readonly sessions: VerificationSessionClient,
    configService: ConfigService,
    private readonly loginEvents?: LoginEventsService
  ) {
    this.ttlMs = configService.oidcConfig.ttl.interaction * 1000
    this.origin = new URL(configService.oidcConfig.issuerUrl).origin
  }

  public async beginLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<BeginLoginResult> {
    this.prune()
    this.pending.delete(interactionUid)
    this.logger.log(`Interaction ${interactionUid}: wallet login page served (login config '${loginConfig.id}')`)
    return { kind: 'page', html: loadPage('ui/login.html') }
  }

  public async beginDirectPostLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<LoginPageData> {
    const created = await this.sessions.createSignedRequest(loginConfig)
    assertWalletAuthorizationRequest(created.authorizationRequest)
    this.entry(interactionUid).directPostSessionId = created.sessionId
    this.loginEvents?.registerSession(created.sessionId, interactionUid)

    this.logger.log(`Interaction ${interactionUid}: cross-device login via verification session ${created.sessionId}`)
    const qrDataUrl = await QRCode.toDataURL(created.authorizationRequest, { width: 260, margin: 1 })
    return { authorizationRequest: created.authorizationRequest, qrDataUrl }
  }

  public async beginDcApiLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<DcApiLoginRequest> {
    const created = await this.sessions.createDcApiRequest(loginConfig, this.origin)
    this.entry(interactionUid).dcApiSessionId = created.sessionId
    this.loginEvents?.registerSession(created.sessionId, interactionUid)

    this.logger.log(`Interaction ${interactionUid}: DC API login via verification session ${created.sessionId}`)
    return { protocol: created.protocol, request: created.authorizationRequestObject }
  }

  public async verifyDcApiLogin(interactionUid: string, authorizationResponse: Record<string, unknown>): Promise<LoginStatus> {
    const sessionId = this.getPending(interactionUid)?.dcApiSessionId
    if (!sessionId) return { status: 'error', message: 'The sign-in attempt expired — please start over.' }

    try {
      const record = await this.sessions.verifyDcApiResponse(sessionId, authorizationResponse, this.origin)
      if (record.state !== VerificationSessionState.ResponseVerified) {
        return { status: 'error', message: record.errorMessage ?? 'The presentation could not be verified.' }
      }
      this.logger.log(`Interaction ${interactionUid}: DC API presentation verified (session ${sessionId})`)
      return { status: 'verified' }
    } catch (error) {
      this.logger.warn(`Interaction ${interactionUid}: DC API verification failed: ${error}`)
      return { status: 'error', message: 'The presentation could not be verified.' }
    }
  }

  public async checkLogin(interactionUid: string): Promise<LoginStatus> {
    const entry = this.getPending(interactionUid)
    if (!entry) return { status: 'error', message: 'The sign-in attempt expired — please start over.' }
    if (!entry.directPostSessionId) return { status: 'pending' }

    const record = await this.sessions.getSession(entry.directPostSessionId)
    switch (record.state) {
      case VerificationSessionState.ResponseVerified:
        return { status: 'verified' }
      case VerificationSessionState.Error:
        return { status: 'error', message: record.errorMessage ?? 'The presentation could not be verified.' }
      default:
        return { status: 'pending' }
    }
  }

  public async completeLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<AcquiredIdentity> {
    const entry = this.getPending(interactionUid)
    if (!entry) throw new Error(`no pending verification session for interaction ${interactionUid}`)

    const sessionIds = [entry.dcApiSessionId, entry.directPostSessionId].filter((sessionId): sessionId is string => !!sessionId)
    if (sessionIds.length === 0) throw new Error(`no verification session started for interaction ${interactionUid}`)

    let verified: { sessionId: string; sharedAttributes?: Record<string, unknown> } | undefined
    const states: string[] = []
    for (const sessionId of sessionIds) {
      const record = await this.sessions.getSession(sessionId)
      if (record.state === VerificationSessionState.ResponseVerified) {
        verified = { sessionId, sharedAttributes: record.sharedAttributes }
        break
      }
      states.push(`${sessionId}: ${record.state}`)
    }
    if (!verified) {
      throw new Error(`no verified session for interaction ${interactionUid} (${states.join(', ')})`)
    }
    this.pending.delete(interactionUid)

    const disclosed: ClaimSet = verified.sharedAttributes ?? {}
    const queryId = this.credentialQueryId(loginConfig)
    const attributes: ClaimSet = Object.fromEntries(Object.entries(disclosed).map(([claim, value]) => [`${queryId}.${claim}`, value]))

    this.logger.log(`Interaction ${interactionUid}: presentation verified (session ${verified.sessionId})`)
    return { attributes, amr: ['vc'], presentedAttributes: disclosed }
  }

  private credentialQueryId(loginConfig: OidcLoginConfig): string {
    const [queryId] = loginConfig.credentialQueryIds
    if (!queryId) throw new Error(`login configuration '${loginConfig.id}' has no DCQL credential query id`)
    return queryId
  }

  private entry(interactionUid: string): PendingLogin {
    this.prune()
    const existing = this.getPending(interactionUid)
    if (existing) return existing
    const created: PendingLogin = { expiresAt: Date.now() + this.ttlMs }
    this.pending.set(interactionUid, created)
    return created
  }

  private getPending(interactionUid: string): PendingLogin | undefined {
    const entry = this.pending.get(interactionUid)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.pending.delete(interactionUid)
      return undefined
    }
    return entry
  }

  private prune(): void {
    const now = Date.now()
    for (const [uid, entry] of this.pending) {
      if (entry.expiresAt <= now) this.pending.delete(uid)
    }
  }
}
