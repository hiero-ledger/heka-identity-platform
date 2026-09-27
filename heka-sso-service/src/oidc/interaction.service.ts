import { ConfigService, OidcLoginConfig, OidcLoginConfigBranding } from '@config'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type Provider from 'oidc-provider'
import type { InteractionResults } from 'oidc-provider'

import { AccountClaimsStore } from './account-claims.store'
import { computeSub, mapClaims, mapDisclosedClaims } from './claims.util'
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

export type InteractionDetails = Awaited<ReturnType<Provider['interactionDetails']>>

export type LoginPromptOutcome = { kind: 'finished'; results: InteractionResults } | { kind: 'page'; html: string }

export class InteractionApiError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'InteractionApiError'
  }
}

@Injectable()
export class InteractionService {
  private readonly logger = new Logger(InteractionService.name)

  public constructor(
    @Inject(OIDC_PROVIDER) private readonly provider: Provider,
    @Optional() @Inject(IDENTITY_ACQUIRER) private readonly identityAcquirer: IdentityAcquirer | null,
    private readonly configService: ConfigService,
    private readonly accountClaims: AccountClaimsStore
  ) {
    this.logger.verbose('constructor<>')
  }

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

  public async loginPageData(details: InteractionDetails): Promise<LoginPageData> {
    const loginConfig = this.requireLoginConfig(details)
    const acquirer = this.identityAcquirer
    if (!supportsDirectPostLogin(acquirer)) throw new InteractionApiError('wallet login is not enabled')
    return await acquirer.beginDirectPostLogin(loginConfig, details.uid)
  }

  public async beginDcApiLogin(details: InteractionDetails): Promise<DcApiLoginRequest> {
    const loginConfig = this.requireLoginConfig(details)
    const acquirer = this.identityAcquirer
    if (!supportsDcApiLogin(acquirer)) throw new InteractionApiError('wallet login is not enabled')
    return await acquirer.beginDcApiLogin(loginConfig, details.uid)
  }

  public async verifyDcApiLogin(details: InteractionDetails, authorizationResponse: Record<string, unknown>): Promise<LoginStatus> {
    const acquirer = this.identityAcquirer
    if (!supportsDcApiLogin(acquirer)) throw new InteractionApiError('wallet login is not enabled')
    return await acquirer.verifyDcApiLogin(details.uid, authorizationResponse)
  }

  public branding(details: InteractionDetails): OidcLoginConfigBranding | Record<string, never> {
    return this.requireLoginConfig(details).branding ?? {}
  }

  public async loginStatus(details: InteractionDetails): Promise<LoginStatus> {
    const acquirer = this.identityAcquirer
    if (!supportsDirectPostLogin(acquirer)) return { status: 'error', message: 'wallet login is not enabled' }
    return await acquirer.checkLogin(details.uid)
  }

  public resolveLoginConfig(clientId: string): OidcLoginConfig | undefined {
    const { clients, loginConfigs } = this.configService.oidcConfig
    const loginConfigId = clients.find((client) => client.clientId === clientId)?.loginConfigId ?? 'default'
    return loginConfigs.find((loginConfig) => loginConfig.id === loginConfigId)
  }

  private finishLogin(details: InteractionDetails, loginConfig: OidcLoginConfig, identity: AcquiredIdentity): InteractionResults {
    const clientId = details.params.client_id as string

    if (Object.keys(mapDisclosedClaims(loginConfig, identity.attributes)).length === 0) {
      return this.failLogin(
        details,
        'access_denied',
        'the presentation disclosed no attribute that the login configuration maps to a claim'
      )
    }

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
