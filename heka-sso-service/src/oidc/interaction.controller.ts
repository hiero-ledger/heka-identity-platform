import { ConfigService, OidcLoginConfig } from '@config'
import { Body, Controller, Get, Inject, Logger, Optional, Post, Req, Res } from '@nestjs/common'
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
 * acquirer serves a static login page (P2.1.1) driven by the JSON routes here
 * — `:uid/data` (QR/deep-link, cross-device), `:uid/dc-api/start` +
 * `:uid/dc-api/verify` (Digital Credentials API, same-device — P2.1),
 * `:uid/status` polling (P1.6.3) — and, once the presentation is verified,
 * the page navigates to `:uid/complete`.
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

  /**
   * The static login page's data (P2.1.1): creates the cross-device
   * verification session and returns the QR + deep-link payload. Cookie-bound
   * like every interaction route (§3.3).
   */
  @Get(':uid/data')
  public async data(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.pageApi(req, res, async (details, loginConfig) => {
      if (!this.identityAcquirer?.getLoginData) {
        res.status(400).json({ status: 'error', message: 'wallet login is not enabled' })
        return
      }
      res.json(await this.identityAcquirer.getLoginData(loginConfig, details.uid))
    })
  }

  /** DC API same-device login, step 1 (P2.1): create the `dc_api` session and return the request object. */
  @Post(':uid/dc-api/start')
  public async dcApiStart(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.pageApi(req, res, async (details, loginConfig) => {
      if (!this.identityAcquirer?.beginDcApiLogin) {
        res.status(400).json({ status: 'error', message: 'wallet login is not enabled' })
        return
      }
      // Nest defaults POST routes to 201 by pre-setting res.statusCode — this is a plain JSON read
      res.status(200).json(await this.identityAcquirer.beginDcApiLogin(loginConfig, details.uid))
    })
  }

  /**
   * DC API same-device login, step 2 (P2.1): the browser forwards the wallet's
   * response (the parsed `DigitalCredential.data`); the bridge submits it to
   * the identity service's origin-bound verify endpoint. The origin is the
   * bridge's own — never taken from the request.
   */
  @Post(':uid/dc-api/verify')
  public async dcApiVerify(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { authorizationResponse?: Record<string, unknown> },
  ): Promise<void> {
    await this.pageApi(req, res, async (details) => {
      if (!this.identityAcquirer?.verifyDcApiLogin) {
        res.status(400).json({ status: 'error', message: 'wallet login is not enabled' })
        return
      }
      if (!body?.authorizationResponse || typeof body.authorizationResponse !== 'object') {
        res.status(400).json({ status: 'error', message: 'authorizationResponse is required' })
        return
      }
      res.status(200).json(await this.identityAcquirer.verifyDcApiLogin(details.uid, body.authorizationResponse))
    })
  }

  /**
   * Shared wrapper for the login page's JSON API (P2.1/P2.1.1): resolves the
   * interaction from the `_interaction` cookie (§3.3 binding — requests
   * without it get a 400 and no session state), resolves the client's login
   * configuration, and turns failures into JSON errors instead of HTML.
   */
  private async pageApi(
    req: Request,
    res: Response,
    handler: (details: InteractionDetails, loginConfig: OidcLoginConfig) => Promise<void>,
  ): Promise<void> {
    let details: InteractionDetails
    try {
      details = await this.provider.interactionDetails(req, res)
    } catch (error) {
      this.logger.warn(`Interaction lookup failed: ${error}`)
      res.status(400).json({ status: 'error', message: 'The sign-in attempt is no longer valid.' })
      return
    }

    const loginConfig = this.resolveLoginConfig(details.params.client_id as string)
    if (!loginConfig) {
      this.logger.error(`Interaction ${details.uid}: no login configuration for client '${details.params.client_id}'`)
      res.status(400).json({ status: 'error', message: 'login is not available' })
      return
    }

    try {
      await handler(details, loginConfig)
    } catch (error) {
      this.logger.error(`Interaction ${details.uid}: page API call failed: ${error}`)
      res.status(400).json({ status: 'error', message: 'The sign-in attempt could not be started.' })
    }
  }

  /** Login progress for the polling login page (P1.6.3). Cookie-bound like every interaction route. */
  @Get(':uid/status')
  public async status(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const details = await this.provider.interactionDetails(req, res)
      if (!this.identityAcquirer) {
        res.json({ status: 'error', message: 'no identity acquisition method is enabled' })
        return
      }
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

    const loginConfig = this.resolveLoginConfig(clientId)
    if (!loginConfig) {
      this.logger.error(`Interaction ${details.uid}: no login configuration for client '${clientId}'`)
      return await this.failLogin(req, res, details, 'server_error', 'no login configuration for client')
    }

    if (!this.identityAcquirer) {
      return await this.failLogin(req, res, details, 'access_denied', 'no identity acquisition method is enabled')
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
