import { OidcLoginConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'

import { ClaimSet } from './claims.util'

/**
 * DI token for the interaction's pluggable identity-acquisition step
 * (INTEGRATION.md P1.3). The wallet-login PR (P1.6) swaps the implementation;
 * `null` is bound when no acquisition method is enabled.
 */
export const IDENTITY_ACQUIRER = 'IDENTITY_ACQUIRER'

export interface AcquiredIdentity {
  /** Disclosed attributes keyed by credential-query claim path (the login config's `claimMapping` keys). */
  attributes: ClaimSet
  /** Authentication method references for the session — `['vc']` only for a real presentation (P1.3.2). */
  amr: string[]
}

/**
 * How the interaction establishes who the user is. P1.6 implements this over
 * heka-identity-service verification sessions; the stub below fakes it.
 */
export interface IdentityAcquirer {
  acquire(loginConfig: OidcLoginConfig, interactionUid: string): Promise<AcquiredIdentity>
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

  public async acquire(loginConfig: OidcLoginConfig, interactionUid: string): Promise<AcquiredIdentity> {
    this.logger.warn(`Stub login (no credential verification) for interaction ${interactionUid}`)

    const attributes: ClaimSet = {}
    for (const [path, claimName] of Object.entries(loginConfig.claimMapping)) {
      attributes[path] = stubIdentityByClaim[claimName] ?? `stub-${claimName}`
    }
    // amr must never claim 'vc' for a stub login (P1.3.2)
    return { attributes, amr: ['stub'] }
  }
}
