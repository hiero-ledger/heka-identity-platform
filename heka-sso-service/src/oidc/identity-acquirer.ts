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
  protocol: 'openid4vp-v1-signed' | 'openid4vp-v1-unsigned'
  /** The authorization request object, passed as the DC API request's `data`. */
  request: Record<string, unknown>
}

/**
 * How the interaction establishes who the user is (feasibility §3.3). The
 * flow is two-phase: `beginLogin` either resolves immediately (stub) or
 * renders a login page; once the page reports the presentation verified it
 * navigates to the completion route, which calls `completeLogin` — in the
 * same cookie-bound browser session (the §3.3 binding rule).
 *
 * The login page's JSON API is modelled as capability
 * interfaces rather than optional methods, so each capability is all-or-
 * nothing and the controller checks for it with the type guards below:
 * - `DirectPostLogin` — the cross-device QR / deep-link path: start the
 *   `direct_post` session and poll its progress;
 * - `DcApiLogin` — the same-device DC API path: start the `dc_api` session
 *   and verify the browser-forwarded response.
 * The stub implements neither (it never renders a page); the wallet acquirer
 * implements both.
 */
export interface IdentityAcquirer {
  beginLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<BeginLoginResult>
  completeLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<AcquiredIdentity>
}

/** Cross-device QR / deep-link path (`direct_post`) — both methods or neither. */
export interface DirectPostLogin {
  /** create the cross-device verification session and return the QR/deep-link data. */
  beginDirectPostLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<LoginPageData>
  /** progress of the pending cross-device login, for the polling page. */
  checkLogin(interactionUid: string): Promise<LoginStatus>
}

/** Same-device DC API path (`dc_api`) — both methods or neither. */
export interface DcApiLogin {
  /** create a DC API verification session and return the `navigator.credentials.get()` request. */
  beginDcApiLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<DcApiLoginRequest>
  /** verify the wallet's DC API response (the parsed `DigitalCredential.data`). */
  verifyDcApiLogin(interactionUid: string, authorizationResponse: Record<string, unknown>): Promise<LoginStatus>
}

const DC_API_METHODS = ['beginDcApiLogin', 'verifyDcApiLogin'] as const satisfies readonly (keyof DcApiLogin)[]
const DIRECT_POST_METHODS = ['beginDirectPostLogin', 'checkLogin'] as const satisfies readonly (keyof DirectPostLogin)[]

const hasMethods = (candidate: unknown, names: string[]): boolean =>
  !!candidate && names.every((name) => typeof (candidate as Record<string, unknown>)[name] === 'function')

/** Whether the acquirer serves the cross-device QR path (`GET :uid/data` + `GET :uid/status`). */
export const supportsDirectPostLogin = (acquirer: IdentityAcquirer | null): acquirer is IdentityAcquirer & DirectPostLogin =>
  hasMethods(acquirer, DIRECT_POST_METHODS as unknown as string[])

/** Whether the acquirer serves the same-device DC API path (`POST :uid/dc-api/start` + `POST :uid/dc-api/verify`). */
export const supportsDcApiLogin = (acquirer: IdentityAcquirer | null): acquirer is IdentityAcquirer & DcApiLogin =>
  hasMethods(acquirer, DC_API_METHODS as unknown as string[])

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
