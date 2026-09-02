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
import { loadPage } from './pages'
import { VerificationSessionClient, VerificationSessionState } from './verification-session.client'
import { assertWalletAuthorizationRequest } from './wallet-uri'

/** The verification sessions a pending interaction may hold — one per login path (P2.1). */
interface PendingLogin {
  /** Cross-device QR / deep-link session (`direct_post`, P1.6). */
  directPostSessionId?: string
  /** Same-device DC API session (`dc_api`, P2.1). */
  dcApiSessionId?: string
  expiresAt: number
}

/**
 * OID4VP wallet login (INTEGRATION.md P1.6 + P2.1, feasibility §3.3):
 * `beginLogin` serves the static login page (P2.1.1); the page then drives
 * one of two paths over the same-origin JSON interaction API:
 *
 * - **DC API (preferred, P2.1)**: `beginDcApiLogin` creates a `dc_api`
 *   verification session; the browser hands the request to the OS picker and
 *   forwards the wallet's response to `verifyDcApiLogin`, which submits it to
 *   the identity service's origin-bound `verify` endpoint. The `origin` is
 *   the bridge's own (from the issuer URL) — never client-supplied.
 * - **QR fallback (P1.6)**: `beginDirectPostLogin` creates a `direct_post` session
 *   (signed JAR — P1.6.1) and returns QR + deep link; the page **polls**
 *   `checkLogin` (P1.6.3 — the WebSocket push is postponed to P3.7).
 *
 * Either way the page navigates to the completion route in the same
 * cookie-bound browser session (§3.3 binding rule); `completeLogin` accepts
 * whichever session reached `ResponseVerified` and maps the disclosed
 * attributes.
 *
 * The uid→session index is in-memory (like the P1.3/P1.4 claim-set store):
 * single-instance dev until it moves into persisted interaction state.
 */
@Injectable()
export class WalletIdentityAcquirer implements IdentityAcquirer, DirectPostLogin, DcApiLogin {
  private readonly logger = new Logger(WalletIdentityAcquirer.name)
  private readonly pending = new Map<string, PendingLogin>()
  private readonly ttlMs: number
  /** The bridge's own web origin — the login page is served from it (§5-Decide-2: the issuer is the service origin). */
  private readonly origin: string

  public constructor(
    private readonly sessions: VerificationSessionClient,
    configService: ConfigService,
  ) {
    this.ttlMs = configService.oidcConfig.ttl.interaction * 1000
    this.origin = new URL(configService.oidcConfig.issuerUrl).origin
  }

  public async beginLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<BeginLoginResult> {
    // A page (re)load starts the login step fresh: previously created
    // verification sessions are abandoned; the sessions themselves are only
    // created once the page engages a path (data / dc-api/start).
    this.prune()
    this.pending.delete(interactionUid)
    this.logger.log(`Interaction ${interactionUid}: wallet login page served (login config '${loginConfig.id}')`)
    // The static login page (P2.1.1), a file template since P2.10.1 — nothing
    // per-interaction is server-rendered into it.
    return { kind: 'page', html: loadPage('login.html') }
  }

  /** P2.1.1 — the QR path's data: creates the cross-device `direct_post` session (fresh nonce, §4.6-1). */
  public async beginDirectPostLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<LoginPageData> {
    const created = await this.sessions.createSignedRequest(loginConfig)
    // Boundary check before the value reaches the page's href / QR: wallet
    // scheme allowlist + JAR by reference; fails closed — the poisoned session
    // is never stored and the page gets a JSON error instead of a deep link.
    assertWalletAuthorizationRequest(created.authorizationRequest)
    this.entry(interactionUid).directPostSessionId = created.sessionId

    this.logger.log(`Interaction ${interactionUid}: cross-device login via verification session ${created.sessionId}`)
    const qrDataUrl = await QRCode.toDataURL(created.authorizationRequest, { width: 260, margin: 1 })
    return { authorizationRequest: created.authorizationRequest, qrDataUrl }
  }

  /** P2.1 — the DC API path: creates the same-device `dc_api` session bound to the bridge origin. */
  public async beginDcApiLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<DcApiLoginRequest> {
    const created = await this.sessions.createDcApiRequest(loginConfig, this.origin)
    this.entry(interactionUid).dcApiSessionId = created.sessionId

    this.logger.log(`Interaction ${interactionUid}: DC API login via verification session ${created.sessionId}`)
    return { protocol: created.protocol, request: created.authorizationRequestObject }
  }

  /** P2.1 — verify the browser-forwarded DC API response via the identity service's origin-bound endpoint. */
  public async verifyDcApiLogin(
    interactionUid: string,
    authorizationResponse: Record<string, unknown>,
  ): Promise<LoginStatus> {
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
      // identity-service detail stays in the server log; the browser gets a generic message
      this.logger.warn(`Interaction ${interactionUid}: DC API verification failed: ${error}`)
      return { status: 'error', message: 'The presentation could not be verified.' }
    }
  }

  public async checkLogin(interactionUid: string): Promise<LoginStatus> {
    const entry = this.getPending(interactionUid)
    if (!entry) return { status: 'error', message: 'The sign-in attempt expired — please start over.' }
    // only the QR path polls; a DC API-only login is pending until its synchronous verify lands
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

    // either path may have finished — take whichever session is verified
    // (the DC API one first: its verify is synchronous and most recent)
    const sessionIds = [entry.dcApiSessionId, entry.directPostSessionId].filter(
      (sessionId): sessionId is string => !!sessionId,
    )
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

    // sharedAttributes is the flat disclosed claim set of the presentation;
    // claim-mapping keys follow `<credential-query id>.<claim>`, so prefix
    // with the (first) DCQL credential query id.
    const disclosed: ClaimSet = verified.sharedAttributes ?? {}
    const queryId = this.credentialQueryId(loginConfig)
    const attributes: ClaimSet = Object.fromEntries(
      Object.entries(disclosed).map(([claim, value]) => [`${queryId}.${claim}`, value]),
    )

    this.logger.log(`Interaction ${interactionUid}: presentation verified (session ${verified.sessionId})`)
    return { attributes, amr: ['vc'], presentedAttributes: disclosed }
  }

  private credentialQueryId(loginConfig: OidcLoginConfig): string {
    // Guaranteed by OidcLoginConfig.dcqlProblems() at config load; no silent
    // fallback — a wrong prefix would map nothing and collapse `sub` (§4.3).
    const [queryId] = loginConfig.credentialQueryIds
    if (!queryId) throw new Error(`login configuration '${loginConfig.id}' has no DCQL credential query id`)
    return queryId
  }

  /** The pending entry for the interaction, created on first use (sessions are started lazily by the page). */
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
