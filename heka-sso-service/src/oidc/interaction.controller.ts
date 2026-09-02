import { ConfigService, OidcLoginConfig } from '@config'
import { Controller, Get, Inject, Logger, Optional, Req, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Request, Response } from 'express'
import type Provider from 'oidc-provider'

import { AccountClaimsStore } from './account-claims.store'
import { computeSub, mapClaims } from './claims.util'
import { AcquiredIdentity, IDENTITY_ACQUIRER, IdentityAcquirer } from './identity-acquirer'
import { OIDC_PROVIDER } from './provider.factory'

type InteractionDetails = Awaited<ReturnType<Provider['interactionDetails']>>

/**
 * Wallet-login interaction (INTEGRATION.md P1.3/P1.6): the provider redirects
 * here from `/authorize` and this controller finishes the interaction —
 * `interactionDetails`/`interactionFinished` over the raw `(req, res)`
 * (§5-Inherit-3). Identity acquisition is pluggable (`IDENTITY_ACQUIRER`):
 * the dev stub completes the login prompt immediately; the OID4VP wallet
 * acquirer renders a login page that polls `:uid/status` (P1.6.3) and, once
 * the presentation is verified, navigates to `:uid/complete`.
 *
 * The binding rule (§3.3) is enforced by construction: `interactionDetails`
 * only resolves when the browser presents the `_interaction` cookie set on the
 * initiating `/authorize` request (its path covers the sub-routes), so the
 * authorization code is released only into that browser session — never into
 * the wallet's return channel.
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

  /** Login progress for the polling login page (P1.6.3). Cookie-bound like every interaction route. */
  @Get(':uid/status')
  public async status(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.identityAcquirer) {
      res.json({ status: 'error', message: 'no identity acquisition method is enabled' })
      return
    }
    try {
      const details = await this.provider.interactionDetails(req, res)
      res.json(await this.identityAcquirer.checkLogin(details.uid))
    } catch (error) {
      this.logger.warn(`Interaction status check failed: ${error}`)
      res.status(400).json({ status: 'error', message: 'The sign-in attempt is no longer valid.' })
    }
  }

  /** Completion route the login page navigates to once the presentation is verified (§3.3 step 12). */
  @Get(':uid/complete')
  public async complete(@Req() req: Request, @Res() res: Response): Promise<void> {
    const details = await this.provider.interactionDetails(req, res)
    if (details.prompt.name !== 'login') {
      return await this.provider.interactionFinished(
        req,
        res,
        { error: 'invalid_request', error_description: 'interaction is not awaiting login' },
        { mergeWithLastSubmission: false },
      )
    }

    const loginConfig = this.resolveLoginConfig(details.params.client_id as string)
    if (!loginConfig || !this.identityAcquirer) {
      return await this.failLogin(req, res, details, 'server_error', 'login is not available')
    }

    try {
      const identity = await this.identityAcquirer.completeLogin(loginConfig, details.uid)
      return await this.finishLogin(req, res, details, loginConfig, identity)
    } catch (error) {
      this.logger.error(`Interaction ${details.uid}: completion failed: ${error}`)
      return await this.failLogin(req, res, details, 'access_denied', 'the wallet presentation was not verified')
    }
  }

  /**
   * Login prompt: resolve the client's login configuration and start the
   * pluggable identity-acquisition step — an immediate identity (stub)
   * finishes the interaction; a login page (wallet) is rendered and the
   * browser drives the rest via `:uid/status` / `:uid/complete`.
   */
  private async login(req: Request, res: Response, details: InteractionDetails): Promise<void> {
    const clientId = details.params.client_id as string
    if (!this.identityAcquirer) {
      return await this.failLogin(req, res, details, 'access_denied', 'no identity acquisition method is enabled')
    }
    const loginConfig = this.resolveLoginConfig(clientId)
    if (!loginConfig) {
      this.logger.error(`Interaction ${details.uid}: no login configuration for client '${clientId}'`)
      return await this.failLogin(req, res, details, 'server_error', 'no login configuration for client')
    }

    try {
      const result = await this.identityAcquirer.beginLogin(loginConfig, details.uid)
      if (result.kind === 'identity') {
        return await this.finishLogin(req, res, details, loginConfig, result.identity)
      }
      res.status(200).type('html').send(result.html)
    } catch (error) {
      this.logger.error(`Interaction ${details.uid}: login start failed: ${error}`)
      return await this.failLogin(req, res, details, 'server_error', 'login could not be started')
    }
  }

  /**
   * The claims pipeline (P1.3/P1.4): map/merge claims, compute `sub` over the
   * **mapped** claim set (§4.3 — the full disclosed set may carry volatile
   * values and must not destabilize the derived `sub`), attach the full
   * disclosed set as `vc_presented_attributes` (feasibility §3.5), store for
   * `findAccount` (§4.4), and finish the interaction.
   */
  private async finishLogin(
    req: Request,
    res: Response,
    details: InteractionDetails,
    loginConfig: OidcLoginConfig,
    identity: AcquiredIdentity,
  ): Promise<void> {
    const clientId = details.params.client_id as string

    // Guard against an empty mapping (§4.3): `mapClaims` drops every attribute
    // whose path is not a claim-mapping key, so if none of them matched the
    // mapped set is just static claims + login_config_id — identical for every
    // user — and a derived `sub` computed over it would merge all wallet
    // holders of this client into one account. Config validation catches wrong
    // prefixes; this catches claim-name mismatches, empty disclosures and
    // upstream renames at runtime. Fail closed instead.
    const mappingPaths = Object.keys(loginConfig.claimMapping)
    const matchedPaths = mappingPaths.filter((path) => identity.attributes[path] !== undefined)
    if (mappingPaths.length > 0 && matchedPaths.length === 0) {
      this.logger.error(
        `Interaction ${details.uid}: none of the ${mappingPaths.length} claim-mapping paths of login configuration ` +
          `'${loginConfig.id}' matched the presented attributes (paths: ${Object.keys(identity.attributes).join(', ') || 'none'}) — ` +
          'refusing to derive sub from a claim set that carries no per-user data',
      )
      return await this.failLogin(
        req,
        res,
        details,
        'access_denied',
        'the presented credential did not contain the required claims',
      )
    }

    const claims = mapClaims(loginConfig, identity.attributes)

    const sub = computeSub(loginConfig, clientId, claims, this.configService.oidcConfig.subHmacSalt)
    if (identity.presentedAttributes) {
      claims.vc_presented_attributes = identity.presentedAttributes
    }
    this.accountClaims.set(sub, claims)

    this.logger.log(`Interaction ${details.uid}: login for client '${clientId}' (amr: ${identity.amr.join(',')})`)
    return await this.provider.interactionFinished(
      req,
      res,
      { login: { accountId: sub, amr: identity.amr } },
      { mergeWithLastSubmission: false },
    )
  }

  private async failLogin(
    req: Request,
    res: Response,
    details: InteractionDetails,
    error: string,
    description: string,
  ): Promise<void> {
    this.logger.warn(`Interaction ${details.uid}: ${error} — ${description}`)
    return await this.provider.interactionFinished(
      req,
      res,
      { error, error_description: description },
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
