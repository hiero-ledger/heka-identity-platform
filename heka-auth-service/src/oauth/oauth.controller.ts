import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request, Response } from 'express'

import { GitHubLoginResponse, LoginRequest, LoginResponse, LogoutRequest, RefreshRequest, RefreshResponse } from './dto'
import { BearerGuard, GitHubGuard, UserAuthGuard } from './guards'
import { AccessToken } from './oauth.decorators'
import { OAuthService } from './oauth.service'
import { GitHubProfile } from './strategies/github.strategy'

@ApiTags('OAuth')
@Controller({ path: 'api/v1/oauth' })
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name)

  public constructor(private readonly authService: OAuthService) {
    this.logger.verbose('constructor >')
    this.logger.verbose('constructor <')
  }

  @ApiOperation({ summary: 'Generate tokens' })
  @ApiBody({ type: LoginRequest })
  @ApiOkResponse({ type: LoginResponse })
  @HttpCode(HttpStatus.OK)
  @Post('token')
  public async login(@Body() body: LoginRequest): Promise<LoginResponse> {
    this.logger.verbose({ name: body.name }, 'login >')
    const response = await this.authService.login(body)
    this.logger.verbose('login <')
    return response
  }

  @ApiOperation({ summary: 'Invalidate tokens' })
  @ApiBody({ type: LogoutRequest })
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.RESET_CONTENT)
  @Post('revoke')
  public async logout(@Body() body: LogoutRequest): Promise<void> {
    this.logger.verbose('logout >')
    await this.authService.logout(body)
    this.logger.verbose('logout <')
  }

  @ApiOperation({ summary: 'Refresh tokens' })
  @ApiBody({ type: RefreshRequest })
  @ApiOkResponse({ type: RefreshResponse })
  @UseGuards(BearerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  public async refreshToken(
    @AccessToken() accessToken: string,
    @Body() body: RefreshRequest,
  ): Promise<RefreshResponse> {
    this.logger.verbose('refreshToken >')
    const response = await this.authService.refreshToken(accessToken, body.refresh)
    this.logger.verbose('refreshToken <')
    return response
  }

  /**
   * Initiates the GitHub OAuth 2.0 authorization flow.
   *
   * Redirects the contributor to GitHub's authorization page. This is the
   * entry point for the contributor identity verification onboarding flow —
   * after authorization, GitHub redirects to /oauth/github/callback.
   */
  @ApiOperation({
    summary: 'Initiate GitHub OAuth login',
    description:
      'Redirects the contributor to GitHub for OAuth 2.0 authentication. ' +
      'First step of the contributor identity verification onboarding flow.',
  })
  @ApiResponse({ status: HttpStatus.FOUND, description: 'Redirects to GitHub authorization page' })
  @Get('github')
  @UseGuards(GitHubGuard)
  public githubLogin(): void {
    // GitHubGuard handles the redirect — no body needed
  }

  /**
   * GitHub OAuth 2.0 callback endpoint.
   *
   * After the contributor authorizes on GitHub, this handler receives the
   * validated profile from GitHubStrategy and issues Heka JWT tokens.
   * The returned tokens can be used to create a cloud wallet, link a GPG key,
   * and issue a Verifiable Credential for the contributor in Heka Identity Service.
   */
  @ApiOperation({
    summary: 'GitHub OAuth callback',
    description:
      'Handles the GitHub OAuth callback. Issues Heka JWT tokens for the authenticated ' +
      'contributor and returns GitHub profile data for use in the onboarding flow.',
  })
  @ApiOkResponse({
    type: GitHubLoginResponse,
    description: 'JWT tokens and GitHub profile info for the authenticated contributor',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'GitHub authentication failed' })
  @Get('github/callback')
  @UseGuards(GitHubGuard)
  public async githubCallback(@Req() req: Request & { user: GitHubProfile }, @Res() res: Response): Promise<void> {
    this.logger.verbose({ githubId: req.user?.id }, 'githubCallback >')
    const response = await this.authService.loginWithGitHub(req.user)
    this.logger.verbose({ githubId: req.user?.id, isNewUser: response.isNewUser }, 'githubCallback <')
    res.status(HttpStatus.OK).json(response)
  }
}
