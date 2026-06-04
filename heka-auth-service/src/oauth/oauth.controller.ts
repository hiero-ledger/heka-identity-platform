import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { LoginRequest, LoginResponse, LogoutRequest, RefreshRequest, RefreshResponse } from './dto'
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
}
