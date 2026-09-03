import { BAD_REQUEST, SUCCESS } from '@const'
import { Body, Controller, Get, Inject, Logger, Post, Req, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Request, Response } from 'express'
import type Provider from 'oidc-provider'
import type { InteractionResults } from 'oidc-provider'

import { InteractionApiError, InteractionDetails, InteractionService } from './interaction.service'
import { OIDC_PROVIDER } from './provider.factory'

/**
 * Wallet-login interaction routes: the provider redirects here from `/authorize`;
 * this controller resolves the interaction and finishes it — `interactionDetails`/`interactionFinished`
 */
@ApiExcludeController()
@Controller('interaction')
export class InteractionController {
  private readonly logger = new Logger(InteractionController.name)

  public constructor(
    @Inject(OIDC_PROVIDER) private readonly provider: Provider,
    private readonly interactions: InteractionService
  ) {
    this.logger.verbose('constructor<>')
  }

  @Get(':uid')
  public async interaction(@Req() req: Request, @Res() res: Response): Promise<void> {
    const details = await this.provider.interactionDetails(req, res)
    this.logger.verbose(`Interaction ${details.uid}: prompt '${details.prompt.name}'`)

    switch (details.prompt.name) {
      case 'login': {
        const outcome = await this.interactions.beginLogin(details)
        if (outcome.kind === 'page') {
          res.status(SUCCESS).type('html').send(outcome.html)
          return
        }
        return await this.finish(req, res, outcome.results)
      }
      case 'consent':
        return await this.finish(req, res, await this.interactions.consent(details), true)
      default:
        return await this.finish(req, res, {
          error: 'interaction_required',
          error_description: `unsupported prompt '${details.prompt.name}'`,
        })
    }
  }

  /** The static login page's data: QR + deep-link payload. Cookie-bound like every interaction route. */
  @Get(':uid/data')
  public async data(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.pageApi(req, res, (details) => this.interactions.loginPageData(details))
  }

  /**
   * Per-client branding for the login page (product name, logo, `--brand-*` colors, custom CSS).
   */
  @Get(':uid/branding')
  public async branding(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.pageApi(req, res, async (details) => this.interactions.branding(details))
  }

  @Post(':uid/dc-api/start')
  public async dcApiStart(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.pageApi(req, res, (details) => this.interactions.beginDcApiLogin(details))
  }

  @Post(':uid/dc-api/verify')
  public async dcApiVerify(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { authorizationResponse?: Record<string, unknown> }
  ): Promise<void> {
    await this.pageApi(req, res, (details) => {
      if (!body?.authorizationResponse || typeof body.authorizationResponse !== 'object') {
        throw new InteractionApiError('authorizationResponse is required')
      }
      return this.interactions.verifyDcApiLogin(details, body.authorizationResponse)
    })
  }

  /** Login progress for the polling login page. Cookie-bound like every interaction route. */
  @Get(':uid/status')
  public async status(@Req() req: Request, @Res() res: Response): Promise<void> {
    let details: InteractionDetails
    try {
      details = await this.provider.interactionDetails(req, res)
    } catch (error) {
      this.logger.warn(`Interaction status check failed: ${error}`)
      res.status(BAD_REQUEST).json({ status: 'error', message: 'The sign-in attempt is no longer valid.' })
      return
    }

    try {
      res.json(await this.interactions.loginStatus(details))
    } catch (error) {
      if (error instanceof InteractionApiError) {
        res.status(BAD_REQUEST).json({ status: 'error', message: error.message })
        return
      }
      this.logger.warn(`Interaction ${details.uid}: login status read failed, still pending: ${error}`)
      res.json({ status: 'pending' })
    }
  }

  /** Completion route the login page navigates to once the presentation is verified. */
  @Get(':uid/complete')
  public async complete(@Req() req: Request, @Res() res: Response): Promise<void> {
    const details = await this.provider.interactionDetails(req, res)
    return await this.finish(req, res, await this.interactions.completeLogin(details))
  }

  /**
   * Shared wrapper for the login page's JSON API: resolves the interaction from the `_interaction` cookie
   */
  private async pageApi(req: Request, res: Response, handler: (details: InteractionDetails) => Promise<unknown>): Promise<void> {
    let details: InteractionDetails
    try {
      details = await this.provider.interactionDetails(req, res)
    } catch (error) {
      this.logger.warn(`Interaction lookup failed: ${error}`)
      res.status(BAD_REQUEST).json({ status: 'error', message: 'The sign-in attempt is no longer valid.' })
      return
    }

    try {
      res.status(SUCCESS).json(await handler(details))
    } catch (error) {
      if (error instanceof InteractionApiError) {
        res.status(BAD_REQUEST).json({ status: 'error', message: error.message })
        return
      }
      this.logger.error(`Interaction ${details.uid}: page API call failed: ${error}`)
      res.status(BAD_REQUEST).json({ status: 'error', message: 'The sign-in attempt could not be started.' })
    }
  }

  private async finish(req: Request, res: Response, results: InteractionResults, mergeWithLastSubmission = false): Promise<void> {
    return await this.provider.interactionFinished(req, res, results, { mergeWithLastSubmission })
  }
}
