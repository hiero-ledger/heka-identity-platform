import { User } from '@core/database'
import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { Sender } from '../oauth'
import { UserAuthGuard } from '../oauth/guards'
import {
  GetProfileResponse,
  RegisterUserRequest,
  RegisterUserResponse,
  RequestChangePasswordRequest,
  RequestChangePasswordResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
} from './dto'
import { UserService } from './user.service'

@ApiTags('User')
@Controller({ path: 'api/v1/user' })
export class UserController {
  private readonly logger = new Logger(UserController.name)

  public constructor(private readonly authService: UserService) {
    this.logger.verbose('constructor >')
    this.logger.verbose('constructor <')
  }

  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterUserRequest })
  @ApiOkResponse({ type: RegisterUserResponse })
  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  public async register(@Body() body: RegisterUserRequest): Promise<RegisterUserResponse> {
    this.logger.verbose({ name: body.name }, 'register >')

    const result = await this.authService.register(body)

    this.logger.verbose('register <')
    return result
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request to change user password' })
  @ApiBody({ type: RequestChangePasswordRequest })
  @ApiOkResponse({ type: RequestChangePasswordResponse })
  @HttpCode(HttpStatus.OK)
  @Post('password/change-request')
  public async requestChangePassword(
    @Body() body: RequestChangePasswordRequest,
  ): Promise<RequestChangePasswordResponse> {
    this.logger.verbose({ name: body.name }, 'requestChangePassword >')

    const result = await this.authService.requestChangePassword(body)

    this.logger.verbose('requestChangePassword <')
    return result
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password' })
  @ApiBody({ type: ChangePasswordRequest })
  @ApiOkResponse({ type: ChangePasswordResponse })
  @HttpCode(HttpStatus.OK)
  @Post('password/change')
  public async changePassword(@Body() body: ChangePasswordRequest): Promise<ChangePasswordResponse> {
    this.logger.verbose('changePassword >')

    const result = await this.authService.changePassword(body)

    this.logger.verbose('changePassword <')
    return result
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user profile details' })
  @ApiOkResponse({ type: GetProfileResponse })
  @UseGuards(UserAuthGuard)
  @Get('profile')
  public async getProfile(@Sender() sender: User): Promise<GetProfileResponse> {
    this.logger.verbose('getProfile >')

    const result = new GetProfileResponse(sender)

    this.logger.verbose('getProfile <')
    return result
  }
}
