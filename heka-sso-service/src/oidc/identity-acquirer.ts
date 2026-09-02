import { OidcLoginConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'

import { ClaimSet } from './claims.util'

/**
 * DI token for the interaction's pluggable identity-acquisition step
 * (INTEGRATION.md P1.3/P1.6). `StubIdentityAcquirer` (dev) and
 * `WalletIdentityAcquirer` (OID4VP) implement it; `null` is bound when no
 * acquisition method is enabled.
 */
export const IDENTITY_ACQUIRER = 'IDENTITY_ACQUIRER'

export interface AcquiredIdentity {
  /** Disclosed attributes keyed by credential-query claim path (the login config's `claimMapping` keys). */
  attributes: ClaimSet
  /** Authentication method references for the session — `['vc']` only for a real presentation (P1.3.2). */
  amr: string[]
  /** The full disclosed set, published under `vc_presented_attributes` (feasibility §3.5). */
  presentedAttributes?: ClaimSet
}

/** Outcome of starting the login step: an immediate identity (stub) or a login page to render (wallet). */
export type BeginLoginResult = { kind: 'identity'; identity: AcquiredIdentity } | { kind: 'page'; html: string }

/** Progress of a pending login, as reported to the polling login page (P1.6.3). */
export type LoginStatus = { status: 'pending' } | { status: 'verified' } | { status: 'error'; message?: string }

/**
 * How the interaction establishes who the user is. The flow is two-phase to
 * fit the target flow's asynchronous wallet presentation (feasibility §3.3):
 * `beginLogin` either resolves immediately (stub) or renders a login page
 * whose browser then polls `checkLogin` and, once verified, navigates to the
 * completion route, which calls `completeLogin` — in the same cookie-bound
 * browser session (the §3.3 binding rule).
 */
export interface IdentityAcquirer {
  beginLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<BeginLoginResult>
  checkLogin(interactionUid: string): Promise<LoginStatus>
  completeLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<AcquiredIdentity>
}

/** Fixed dev identity the stub discloses, keyed by OIDC claim name. */
const stubIdentityByClaim: ClaimSet = {
  given_name: 'Stub',
  family_name: 'User',
  email: 'stub.user@example.com',
  email_verified: true,
}

/**
 * Dev-only stub (INTEGRATION.md P1.3): synthesizes a "disclosed" attribute for
 * every claim-mapping entry of the login configuration — so the real mapping
 * pipeline is exercised — without any credential presentation. Only bound when
 * `OIDC_STUB_LOGIN=true`; production refuses that flag (P1.3.1).
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
    // amr must never claim 'vc' for a stub login (P1.3.2)
    return { attributes, amr: ['stub'] }
  }
}
