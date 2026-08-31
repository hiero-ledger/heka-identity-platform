import { OidcLoginConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'

import { ClaimSet } from './claims.util'

/**
 * DI token for the interaction's pluggable identity-acquisition step. `StubIdentityAcquirer` (dev) and
 * `WalletIdentityAcquirer` (OID4VP) implement it; `null` is bound when no
 * acquisition method is enabled.
 */
export const IDENTITY_ACQUIRER = 'IDENTITY_ACQUIRER'

export interface AcquiredIdentity {
  /** Disclosed attributes keyed by credential-query claim path (the login config's `claimMapping` keys). */
  attributes: ClaimSet
  /** Authentication method references for the session — `['vc']` only for a real presentation. */
  amr: string[]
  /** The full disclosed set, published under `vc_presented_attributes`. */
  presentedAttributes?: ClaimSet
}

/** Outcome of starting the login step: an immediate identity (stub) or a login page to render (wallet). */
export type BeginLoginResult = { kind: 'identity'; identity: AcquiredIdentity } | { kind: 'page'; html: string }

/** Progress of a pending login, as reported to the polling login page. */
export type LoginStatus = { status: 'pending' } | { status: 'verified' } | { status: 'error'; message?: string }

/** JSON payload for the static login page's QR path (`GET /interaction/:uid/data`). */
export interface LoginPageData {
  /** Wallet-facing authorization request URI (`openid4vp://?request_uri=…`) — the deep-link target. */
  authorizationRequest: string
  /** Server-rendered QR of `authorizationRequest`, as a `data:image/png` URL. */
  qrDataUrl: string
}

/** A DC API request for `navigator.credentials.get()` (`POST /interaction/:uid/dc-api/start`). */
export interface DcApiLoginRequest {
  /** DC API protocol identifier (`openid4vp-v1-signed` / `openid4vp-v1-unsigned`). */
  protocol: string
  /** The authorization request object, passed as the DC API request's `data`. */
  request: Record<string, unknown>
}

/**
 * How the interaction establishes who the user is. The flow is two-phase to
 * fit the target flow's asynchronous wallet presentation:
 * `beginLogin` either resolves immediately (stub) or renders a login page
 * whose browser then polls `checkLogin` and, once verified, navigates to the
 * completion route, which calls `completeLogin` — in the same cookie-bound
 * browser session.
 *
 * The optional methods are the static login page's JSON API —
 * only the wallet acquirer implements them (the stub never renders a page):
 * `getLoginData` starts the cross-device QR path, `beginDcApiLogin` /
 * `verifyDcApiLogin` the DC API same-device path.
 */
export interface IdentityAcquirer {
  beginLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<BeginLoginResult>
  checkLogin(interactionUid: string): Promise<LoginStatus>
  completeLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<AcquiredIdentity>
  /** create the cross-device verification session and return the QR/deep-link data. */
  getLoginData?(loginConfig: OidcLoginConfig, interactionUid: string): Promise<LoginPageData>
  /** create a DC API verification session and return the `navigator.credentials.get()` request. */
  beginDcApiLogin?(loginConfig: OidcLoginConfig, interactionUid: string): Promise<DcApiLoginRequest>
  /** verify the wallet's DC API response (the parsed `DigitalCredential.data`). */
  verifyDcApiLogin?(interactionUid: string, authorizationResponse: Record<string, unknown>): Promise<LoginStatus>
}

/** Fixed dev identity the stub discloses, keyed by OIDC claim name. */
const stubIdentityByClaim: ClaimSet = {
  given_name: 'Stub',
  family_name: 'User',
  email: 'stub.user@example.com',
  email_verified: true,
}

/**
 * Dev-only stub: synthesizes a "disclosed" attribute for
 * every claim-mapping entry of the login configuration — so the real mapping
 * pipeline is exercised — without any credential presentation. Only bound when
 * `OIDC_STUB_LOGIN=true`; production refuses that flag.
 */
@Injectable()
export class StubIdentityAcquirer implements IdentityAcquirer {
  private readonly logger = new Logger(StubIdentityAcquirer.name)

  public async beginLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<BeginLoginResult> {
    return { kind: 'identity', identity: await this.acquire(loginConfig, interactionUid) }
  }

  public async checkLogin(): Promise<LoginStatus> {
    // the stub never renders a polling page — nothing is ever pending
    return { status: 'verified' }
  }

  public async completeLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<AcquiredIdentity> {
    return await this.acquire(loginConfig, interactionUid)
  }

  private async acquire(loginConfig: OidcLoginConfig, interactionUid: string): Promise<AcquiredIdentity> {
    this.logger.warn(`Stub login (no credential verification) for interaction ${interactionUid}`)

    const attributes: ClaimSet = {}
    for (const [path, claimName] of Object.entries(loginConfig.claimMapping)) {
      attributes[path] = stubIdentityByClaim[claimName] ?? `stub-${claimName}`
    }
    // amr must never claim 'vc' for a stub login
    return { attributes, amr: ['stub'] }
  }
}
