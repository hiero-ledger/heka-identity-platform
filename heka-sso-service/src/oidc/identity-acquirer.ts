import { OidcLoginConfig } from '@config'
import { Injectable, Logger } from '@nestjs/common'

import { ClaimSet } from './claims.util'

export const IDENTITY_ACQUIRER = 'IDENTITY_ACQUIRER'

export interface AcquiredIdentity {
  attributes: ClaimSet
  amr: string[]
  presentedAttributes?: ClaimSet
}

export type BeginLoginResult = { kind: 'identity'; identity: AcquiredIdentity } | { kind: 'page'; html: string }

export type LoginStatus = { status: 'pending' } | { status: 'verified' } | { status: 'error'; message?: string }

export interface LoginPageData {
  authorizationRequest: string
  qrDataUrl: string
}

export interface DcApiLoginRequest {
  protocol: 'openid4vp-v1-signed' | 'openid4vp-v1-unsigned'
  request: Record<string, unknown>
}

export interface IdentityAcquirer {
  beginLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<BeginLoginResult>
  completeLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<AcquiredIdentity>
}

export interface DirectPostLogin {
  beginDirectPostLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<LoginPageData>
  checkLogin(interactionUid: string): Promise<LoginStatus>
}

export interface DcApiLogin {
  beginDcApiLogin(loginConfig: OidcLoginConfig, interactionUid: string): Promise<DcApiLoginRequest>
  verifyDcApiLogin(interactionUid: string, authorizationResponse: Record<string, unknown>): Promise<LoginStatus>
}

const DC_API_METHODS = ['beginDcApiLogin', 'verifyDcApiLogin'] as const satisfies readonly (keyof DcApiLogin)[]
const DIRECT_POST_METHODS = ['beginDirectPostLogin', 'checkLogin'] as const satisfies readonly (keyof DirectPostLogin)[]

const hasMethods = (candidate: unknown, names: string[]): boolean =>
  !!candidate && names.every((name) => typeof (candidate as Record<string, unknown>)[name] === 'function')

export const supportsDirectPostLogin = (acquirer: IdentityAcquirer | null): acquirer is IdentityAcquirer & DirectPostLogin =>
  hasMethods(acquirer, DIRECT_POST_METHODS as unknown as string[])

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
 * `OIDC_STUB_LOGIN=true`.
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
