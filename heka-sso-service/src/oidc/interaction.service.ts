import { ConfigService, OidcLoginConfig } from '@config'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type Provider from 'oidc-provider'
import type { InteractionResults } from 'oidc-provider'

import { AccountClaimsStore } from './account-claims.store'
import { computeSub, mapClaims } from './claims.util'
import {
  AcquiredIdentity,
  DcApiLoginRequest,
  IDENTITY_ACQUIRER,
  IdentityAcquirer,
  LoginPageData,
  LoginStatus,
  supportsDcApiLogin,
  supportsDirectPostLogin,
} from './identity-acquirer'
import { OIDC_PROVIDER } from './provider.factory'

/** The provider's view of a pending interaction (`interactionDetails`). */
export type InteractionDetails = Awaited<ReturnType<Provider['interactionDetails']>>

/**
 * Outcome of the login prompt: the interaction is finished (an identity was
 * established immediately, or the login failed) or a login page must be
 * rendered and the browser drives the rest via the page API.
 */
export type LoginPromptOutcome = { kind: 'finished'; results: InteractionResults } | { kind: 'page'; html: string }

/**
 * A user-facing failure of the login page's JSON API (P2.1/P2.1.1) — the
 * controller answers it with a 400 carrying this message. Anything else thrown
 * by the page API is an internal failure and is reported generically.
 */
export class InteractionApiError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'InteractionApiError'
  }
}

/**
 * Wallet-login interaction logic (INTEGRATION.md P1.3/P1.6/P2.1): login-config
 * resolution (§4.2), the pluggable identity-acquisition step
 * (`IDENTITY_ACQUIRER` — dev stub or OID4VP wallet acquirer), the login page's
 * JSON API gated on the acquirer's capabilities, the claims pipeline that
 * derives `sub` (§4.3) and the auto-granted consent. It works on the
 * provider's `InteractionDetails` and returns `InteractionResults`; the HTTP
 * side — `interactionDetails`/`interactionFinished` over the raw `(req, res)`
 * (§5-Inherit-3), status codes, JSON error shapes — stays in
 * `InteractionController`.
 */
@Injectable()
export class InteractionService {
  private readonly logger = new Logger(InteractionService.name)

  public constructor(
    @Inject(OIDC_PROVIDER) private readonly provider: Provider,
    @Optional() @Inject(IDENTITY_ACQUIRER) private readonly identityAcquirer: IdentityAcquirer | null,
    private readonly configService: ConfigService,
    private readonly accountClaims: AccountClaimsStore,
  ) {
    this.logger.verbose('constructor<>')
  }

  /**
   * Login prompt: resolve the client's login configuration and start the
   * identity-acquisition step — an immediate identity (stub) finishes the
   * interaction; a login page (wallet) is rendered and the browser drives the
   * rest via the page API and `:uid/complete`.
   */
  public async beginLogin(details: InteractionDetails): Promise<LoginPromptOutcome> {
    const clientId = details.params.client_id as string

    if (!this.identityAcquirer) {
      return this.finished(this.failLogin(details, 'access_denied', 'no identity acquisition method is enabled'))
    }

    const loginConfig = this.resolveLoginConfig(clientId)
    if (!loginConfig) {
      this.logger.error(`Interaction ${details.uid}: no login configuration for client '${clientId}'`)
      return this.finished(this.failLogin(details, 'server_error', 'no login configuration for client'))
    }

    try {
      const result = await this.identityAcquirer.beginLogin(loginConfig, details.uid)
      if (result.kind === 'identity') {
        return this.finished(this.finishLogin(details, loginConfig, result.identity))
      }
      return { kind: 'page', html: result.html }
    } catch (error) {
      this.logger.error(`Interaction ${details.uid}: login start failed: ${error}`)
      return this.finished(this.failLogin(details, 'server_error', 'login could not be started'))
    }
  }

  /** Completion once the login page reports the presentation verified (§3.3 step 12). */
  public async completeLogin(details: InteractionDetails): Promise<InteractionResults> {
    if (details.prompt.name !== 'login') {
      return { error: 'invalid_request', error_description: 'interaction is not awaiting login' }
    }

    const loginConfig = this.resolveLoginConfig(details.params.client_id as string)
    if (!loginConfig || !this.identityAcquirer) {
      return this.failLogin(details, 'server_error', 'login is not available')
    }

    try {
      const identity = await this.identityAcquirer.completeLogin(loginConfig, details.uid)
      return this.finishLogin(details, loginConfig, identity)
    } catch (error) {
      this.logger.error(`Interaction ${details.uid}: completion failed: ${error}`)
      return this.failLogin(details, 'access_denied', 'the wallet presentation was not verified')
    }
  }

  /**
   * Consent prompt: auto-granted. The bridge renders no consent screen of its
   * own — the user consents in the wallet when disclosing attributes (stub:
   * nothing to consent to), and the only clients are brokering IdPs, so the
   * requested scopes/claims are granted as-is.
   */
  public async consent(details: InteractionDetails): Promise<InteractionResults> {
    const promptDetails = details.prompt.details as {
      missingOIDCScope?: string[]
      missingOIDCClaims?: string[]
      missingResourceScopes?: Record<string, string[]>
    }

    const grant = details.grantId
      ? await this.provider.Grant.find(details.grantId)
      : new this.provider.Grant({
          accountId: details.session!.accountId,
          clientId: details.params.client_id as string,
        })
    if (!grant) throw new Error(`grant '${details.grantId}' not found for interaction ${details.uid}`)

    if (promptDetails.missingOIDCScope) grant.addOIDCScope(promptDetails.missingOIDCScope.join(' '))
    if (promptDetails.missingOIDCClaims) grant.addOIDCClaims(promptDetails.missingOIDCClaims)
    for (const [indicator, scopes] of Object.entries(promptDetails.missingResourceScopes ?? {})) {
      grant.addResourceScope(indicator, scopes.join(' '))
    }

    const grantId = await grant.save()
    return { consent: { grantId } }
  }

  /** P2.1.1 — the static login page's QR/deep-link data: creates the cross-device verification session. */
  public async loginPageData(details: InteractionDetails): Promise<LoginPageData> {
    const loginConfig = this.requireLoginConfig(details)
    const acquirer = this.identityAcquirer
    if (!supportsDirectPostLogin(acquirer)) throw new InteractionApiError('wallet login is not enabled')
    return await acquirer.beginDirectPostLogin(loginConfig, details.uid)
  }

  /** P2.1 — DC API same-device login, step 1: create the `dc_api` session and return the request object. */
  public async beginDcApiLogin(details: InteractionDetails): Promise<DcApiLoginRequest> {
    const loginConfig = this.requireLoginConfig(details)
    const acquirer = this.identityAcquirer
    if (!supportsDcApiLogin(acquirer)) throw new InteractionApiError('wallet login is not enabled')
    return await acquirer.beginDcApiLogin(loginConfig, details.uid)
  }

  /**
   * P2.1 — DC API same-device login, step 2: the browser forwards the wallet's
   * response (the parsed `DigitalCredential.data`); the acquirer submits it to
   * the identity service's origin-bound verify endpoint. The origin is the
   * bridge's own — never taken from the request.
   */
  public async verifyDcApiLogin(
    details: InteractionDetails,
    authorizationResponse: Record<string, unknown>,
  ): Promise<LoginStatus> {
    const acquirer = this.identityAcquirer
    if (!supportsDcApiLogin(acquirer)) throw new InteractionApiError('wallet login is not enabled')
    return await acquirer.verifyDcApiLogin(details.uid, authorizationResponse)
  }

  /** P1.6.3 — login progress for the polling login page (only the cross-device path polls). */
  public async loginStatus(details: InteractionDetails): Promise<LoginStatus> {
    const acquirer = this.identityAcquirer
    if (!supportsDirectPostLogin(acquirer)) return { status: 'error', message: 'wallet login is not enabled' }
    return await acquirer.checkLogin(details.uid)
  }

  /**
   * Login-config resolution (§4.2): by the client's `loginConfigId`, falling
   * back to the config with id `default`.
   */
  public resolveLoginConfig(clientId: string): OidcLoginConfig | undefined {
    const { clients, loginConfigs } = this.configService.oidcConfig
    const loginConfigId = clients.find((client) => client.clientId === clientId)?.loginConfigId ?? 'default'
    return loginConfigs.find((loginConfig) => loginConfig.id === loginConfigId)
  }

  /**
   * The claims pipeline (P1.3/P1.4): map/merge claims, compute `sub` over the
   * **mapped** claim set (§4.3 — the full disclosed set may carry volatile
   * values and must not destabilize the derived `sub`), attach the full
   * disclosed set as `vc_presented_attributes` (feasibility §3.5), store for
   * `findAccount` (§4.4), and produce the login result.
   */
  private finishLogin(
    details: InteractionDetails,
    loginConfig: OidcLoginConfig,
    identity: AcquiredIdentity,
  ): InteractionResults {
    const clientId = details.params.client_id as string
    const claims = mapClaims(loginConfig, identity.attributes)
    const sub = computeSub(loginConfig, clientId, claims, this.configService.oidcConfig.subHmacSalt)
    if (identity.presentedAttributes) {
      claims.vc_presented_attributes = identity.presentedAttributes
    }
    this.accountClaims.set(sub, claims)

    this.logger.log(`Interaction ${details.uid}: login for client '${clientId}' (amr: ${identity.amr.join(',')})`)
    return { login: { accountId: sub, amr: identity.amr } }
  }

  private failLogin(details: InteractionDetails, error: string, description: string): InteractionResults {
    this.logger.warn(`Interaction ${details.uid}: ${error} — ${description}`)
    return { error, error_description: description }
  }

  private finished(results: InteractionResults): LoginPromptOutcome {
    return { kind: 'finished', results }
  }

  /** The page API's login-config lookup: a missing configuration is a user-facing "login is not available". */
  private requireLoginConfig(details: InteractionDetails): OidcLoginConfig {
    const clientId = details.params.client_id as string
    const loginConfig = this.resolveLoginConfig(clientId)
    if (!loginConfig) {
      this.logger.error(`Interaction ${details.uid}: no login configuration for client '${clientId}'`)
      throw new InteractionApiError('login is not available')
    }
    return loginConfig
  }
}
