import { ConfigService, OidcLoginConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'
import * as QRCode from 'qrcode'

import { ClaimSet } from './claims.util'
import { AcquiredIdentity, BeginLoginResult, IdentityAcquirer, LoginStatus } from './identity-acquirer'
import { renderLoginPage } from './login-page'
import { VerificationSessionClient, VerificationSessionState } from './verification-session.client'

/**
 * OID4VP wallet login (INTEGRATION.md P1.6, feasibility §3.3): `beginLogin`
 * creates a verification session in heka-identity-service (signed JAR —
 * P1.6.1) and renders the login page — QR code + wallet deep link of the
 * `request_uri` authorization request. The page **polls** the interaction's
 * status route (P1.6.3 — the WebSocket push lands in Phase 2/P2.2) and, once
 * the wallet's `direct_post` response is verified, navigates to the completion
 * route in the same cookie-bound browser session (§3.3 binding rule);
 * `completeLogin` then maps the disclosed attributes.
 *
 * The uid→session index is in-memory (like the P1.3/P1.4 claim-set store):
 * single-instance dev until it moves into persisted interaction state.
 */
@Injectable()
export class WalletIdentityAcquirer implements IdentityAcquirer {
  private readonly logger = new Logger(WalletIdentityAcquirer.name)
  private readonly pending = new Map<string, { sessionId: string; expiresAt: number }>()
  private readonly ttlMs: number

  public constructor(
    private readonly sessions: VerificationSessionClient,
    configService: ConfigService,
  ) {
    this.ttlMs = configService.oidcConfig.ttl.interaction * 1000
  }

  public async beginLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<BeginLoginResult> {
    // A page re-render starts a fresh verification session (fresh nonce,
    // one-time request_uri — §4.6-1); the previous one is simply abandoned.
    const created = await this.sessions.createSignedRequest(loginConfig)
    this.prune()
    this.pending.set(interactionUid, { sessionId: created.sessionId, expiresAt: Date.now() + this.ttlMs })

    this.logger.log(`Interaction ${interactionUid}: wallet login via verification session ${created.sessionId}`)
    const qrDataUrl = await QRCode.toDataURL(created.authorizationRequest, { width: 260, margin: 1 })
    return { kind: 'page', html: renderLoginPage(interactionUid, created.authorizationRequest, qrDataUrl) }
  }

  public async checkLogin(interactionUid: string): Promise<LoginStatus> {
    const entry = this.getPending(interactionUid)
    if (!entry) return { status: 'error', message: 'The sign-in attempt expired — please start over.' }

    const record = await this.sessions.getSession(entry.sessionId)
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

    const record = await this.sessions.getSession(entry.sessionId)
    if (record.state !== VerificationSessionState.ResponseVerified) {
      throw new Error(`verification session ${entry.sessionId} is not verified (state: ${record.state})`)
    }
    this.pending.delete(interactionUid)

    // sharedAttributes is the flat disclosed claim set of the presentation;
    // claim-mapping keys follow `<credential-query id>.<claim>`, so prefix
    // with the (first) DCQL credential query id.
    const disclosed: ClaimSet = record.sharedAttributes ?? {}
    const queryId = this.credentialQueryId(loginConfig)
    const attributes: ClaimSet = Object.fromEntries(
      Object.entries(disclosed).map(([claim, value]) => [`${queryId}.${claim}`, value]),
    )

    this.logger.log(`Interaction ${interactionUid}: presentation verified (session ${entry.sessionId})`)
    return { attributes, amr: ['vc'], presentedAttributes: disclosed }
  }

  private credentialQueryId(loginConfig: OidcLoginConfig): string {
    const credentials = (loginConfig.dcqlQuery as { credentials?: { id?: string }[] } | undefined)?.credentials
    return credentials?.[0]?.id ?? 'credential'
  }

  private getPending(interactionUid: string): { sessionId: string; expiresAt: number } | undefined {
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
