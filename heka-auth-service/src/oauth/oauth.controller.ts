import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'

import { IntrospectResponse, LoginRequest, LoginResponse, LogoutRequest, RefreshRequest, RefreshResponse } from './dto'
import { BearerGuard, UserAuthGuard } from './guards'
import { AccessToken } from './oauth.decorators'
import { OAuthService } from './oauth.service'

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
  public async logout(@AccessToken() accessToken: string, @Body() body: LogoutRequest): Promise<void> {
    this.logger.verbose('logout >')

    await this.authService.logout(accessToken, body)

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

  // Called by resource servers (Identity Service) on every authenticated request when revocation checking is enabled,
  // all from the same address, so the per-IP global throttler must not apply.
  @ApiOperation({
    summary: 'Check whether the bearer access token is active',
    description:
      'Reports whether the access token sent in the Authorization header was issued by this service and has not been revoked or expired. Refresh tokens are never reported as active.',
  })
  @ApiOkResponse({ type: IntrospectResponse })
  @ApiUnauthorizedResponse({ description: 'The Authorization header is missing or is not a Bearer token.' })
  @UseGuards(BearerGuard)
  @ApiBearerAuth()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('introspect')
  public async introspect(@AccessToken() accessToken: string): Promise<IntrospectResponse> {
    this.logger.verbose('introspect >')

    const active = await this.authService.isAccessTokenActive(accessToken)

    this.logger.verbose({ active }, 'introspect <')
    return new IntrospectResponse({ active })
  }
}
