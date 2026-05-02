import { User, UserRole } from '@core/database'
import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Param, Patch, Post, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { Sender } from '../oauth'
import { Roles, RolesGuard, UserAuthGuard } from '../oauth/guards'
import {
  ChangePasswordRequest,
  ChangePasswordResponse,
  GetProfileResponse,
  RegisterUserRequest,
  RegisterUserResponse,
  RequestChangePasswordRequest,
  RequestChangePasswordResponse,
  UpdateUserRoleRequest,
  UpdateUserRoleResponse,
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

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign a role to a user (Admin only)' })
  @ApiParam({ name: 'id', description: 'ID of the user whose role will be updated' })
  @ApiBody({ type: UpdateUserRoleRequest })
  @ApiOkResponse({ type: UpdateUserRoleResponse })
  @ApiUnauthorizedResponse({ description: 'Unauthorized — valid bearer token required' })
  @ApiForbiddenResponse({ description: 'Forbidden — Admin role required' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @Patch(':id/role')
  public async updateUserRole(
    @Sender() sender: User,
    @Param('id') id: string,
    @Body() body: UpdateUserRoleRequest,
  ): Promise<UpdateUserRoleResponse> {
    this.logger.verbose({ id }, 'updateUserRole >')

    const result = await this.authService.updateUserRole(sender.id, id, body.role)

    this.logger.verbose('updateUserRole <')
    return result
  }
}
