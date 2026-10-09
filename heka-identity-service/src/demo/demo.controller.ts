import { BadGatewayException, Controller, Get, Header, NotFoundException, UseGuards } from '@nestjs/common'
import {
  ApiBadGatewayResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger'
import { ThrottlerGuard } from '@nestjs/throttler'

import { InjectLogger, Logger } from 'common/logger'

import { DemoTokenProvider } from './demo-token.provider'
import { DemoTokenResponseDto } from './dto/demo-token.dto'

/**
 * Demo-token broker: the public demo pages of the web UI call `GET /demo/token` instead of shipping
 * a long-lived token in the bundle. Anyone can call it (as anyone could read the bundled token before),
 * so the token belongs to a dedicated demo service account with the minimum role, lives minutes rather
 * than a year, and the endpoint is rate-limited per client IP.
 */
@ApiTags('Demo')
@Controller('demo')
@UseGuards(ThrottlerGuard)
@ApiNotFoundResponse({ description: 'Demo token broker is not enabled' })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
export class DemoController {
  public constructor(
    private readonly demoTokenProvider: DemoTokenProvider,
    @InjectLogger(DemoController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Short-lived access token of the demo service account for the public demo pages' })
  @ApiOkResponse({ type: DemoTokenResponseDto })
  @ApiBadGatewayResponse({ description: 'The OIDC provider did not issue a token' })
  @Get('token')
  @Header('Cache-Control', 'no-store')
  public async getToken(): Promise<DemoTokenResponseDto> {
    const logger = this.logger.child('getToken')
    logger.trace('>')

    if (!this.demoTokenProvider.enabled) {
      throw new NotFoundException('Demo token broker is not enabled')
    }

    let token
    try {
      token = await this.demoTokenProvider.getToken()
    } catch (error) {
      logger.error({ err: error }, '! demo token could not be obtained')
      throw new BadGatewayException('Demo token could not be obtained from the OIDC provider')
    }

    const res: DemoTokenResponseDto = {
      access_token: token.accessToken,
      token_type: 'Bearer',
      expires_in: Math.max(0, Math.floor((token.expiresAt - Date.now()) / 1000)),
    }
    logger.trace({ expires_in: res.expires_in }, '<')
    return res
  }
}
