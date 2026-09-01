import { ConfigService, OidcLoginConfig } from '@config'
import { Controller, Get, Inject, Logger, Optional, Req, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Request, Response } from 'express'
import type Provider from 'oidc-provider'

import { AccountClaimsStore } from './account-claims.store'
import { computeSub, mapClaims } from './claims.util'
import { IDENTITY_ACQUIRER, IdentityAcquirer } from './identity-acquirer'
import { OIDC_PROVIDER } from './provider.factory'

type InteractionDetails = Awaited<ReturnType<Provider['interactionDetails']>>

/**
 * Wallet-login interaction (INTEGRATION.md P1.3): the provider redirects here
 * from `/authorize` and this controller finishes the interaction —
 * `interactionDetails`/`interactionFinished` over the raw `(req, res)`
 * (§5-Inherit-3). Identity acquisition is pluggable (`IDENTITY_ACQUIRER`):
 * the dev stub in this PR, the OID4VP wallet presentation in P1.6.
 *
 * The binding rule (§3.3) is enforced by construction: `interactionDetails`
 * only resolves when the browser presents the `_interaction` cookie set on the
 * initiating `/authorize` request, so the authorization code is released only
 * into that browser session.
 */
@ApiExcludeController()
@Controller('interaction')
export class InteractionController {
  private readonly logger = new Logger(InteractionController.name)

  public constructor(
    @Inject(OIDC_PROVIDER) private readonly provider: Provider,
    @Optional() @Inject(IDENTITY_ACQUIRER) private readonly identityAcquirer: IdentityAcquirer | null,
    private readonly configService: ConfigService,
    private readonly accountClaims: AccountClaimsStore,
  ) {
    this.logger.verbose('constructor<>')
  }

  @Get(':uid')
  public async interaction(@Req() req: Request, @Res() res: Response): Promise<void> {
    const details = await this.provider.interactionDetails(req, res)
    this.logger.verbose(`Interaction ${details.uid}: prompt '${details.prompt.name}'`)

    switch (details.prompt.name) {
      case 'login':
        return await this.login(req, res, details)
      case 'consent':
        return await this.consent(req, res, details)
      default:
        return await this.provider.interactionFinished(
          req,
          res,
          { error: 'interaction_required', error_description: `unsupported prompt '${details.prompt.name}'` },
          { mergeWithLastSubmission: false },
        )
    }
  }

  /**
   * Login prompt: resolve the client's login configuration, run the pluggable
   * identity-acquisition step, then the claims pipeline — map/merge claims,
   * compute `sub`, store the claim set for `findAccount` (§4.4) — and finish.
   */
  private async login(req: Request, res: Response, details: InteractionDetails): Promise<void> {
    const clientId = details.params.client_id as string

    const loginConfig = this.resolveLoginConfig(clientId)
    if (!loginConfig) {
      this.logger.error(`Interaction ${details.uid}: no login configuration for client '${clientId}'`)
      return await this.provider.interactionFinished(
        req,
        res,
        { error: 'server_error', error_description: 'no login configuration for client' },
        { mergeWithLastSubmission: false },
      )
    }

    if (!this.identityAcquirer) {
      return await this.provider.interactionFinished(
        req,
        res,
        {
          error: 'access_denied',
          error_description: 'no identity acquisition method is enabled',
        },
        { mergeWithLastSubmission: false },
      )
    }

    const identity = await this.identityAcquirer.acquire(loginConfig, details.uid)
    const claims = mapClaims(loginConfig, identity.attributes)
    const sub = computeSub(loginConfig, clientId, claims, this.configService.oidcConfig.subHmacSalt)
    this.accountClaims.set(sub, claims)

    this.logger.log(`Interaction ${details.uid}: login for client '${clientId}' (amr: ${identity.amr.join(',')})`)
    return await this.provider.interactionFinished(
      req,
      res,
      { login: { accountId: sub, amr: identity.amr } },
      { mergeWithLastSubmission: false },
    )
  }

  /**
   * Consent prompt: auto-granted. The bridge renders no consent screen of its
   * own — the user consents in the wallet when disclosing attributes (stub:
   * nothing to consent to), and the only clients are brokering IdPs, so the
   * requested scopes/claims are granted as-is.
   */
  private async consent(req: Request, res: Response, details: InteractionDetails): Promise<void> {
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
    return await this.provider.interactionFinished(
      req,
      res,
      { consent: { grantId } },
      { mergeWithLastSubmission: true },
    )
  }

  /**
   * Login-config resolution (§4.2): by the client's `loginConfigId`, falling
   * back to the config with id `default`.
   */
  private resolveLoginConfig(clientId: string): OidcLoginConfig | undefined {
    const { clients, loginConfigs } = this.configService.oidcConfig
    const loginConfigId = clients.find((client) => client.clientId === clientId)?.loginConfigId ?? 'default'
    return loginConfigs.find((loginConfig) => loginConfig.id === loginConfigId)
  }
}
