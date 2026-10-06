import { User } from '@core/database'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'

import { Sender } from '../oauth'
import { UserAuthGuard } from '../oauth/guards'
import { ListUsersResponse, UpdateUserRoleRequest, UserRoleItem } from './dto'
import { UserRoleService } from './user-role.service'

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller({ path: 'api/v1/users' })
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  public constructor(private readonly userRoleService: UserRoleService) {}

  @ApiOperation({ summary: 'List the users whose role the caller can manage (Admin, OrgAdmin)' })
  @ApiOkResponse({ type: ListUsersResponse })
  @ApiForbiddenResponse({ description: 'The caller cannot manage user roles' })
  @Get()
  public async list(@Sender() sender: User): Promise<ListUsersResponse> {
    this.logger.verbose('list >')

    const result = await this.userRoleService.list(sender)

    this.logger.verbose('list <')
    return result
  }

  @ApiOperation({ summary: "Change a user's role (Admin: any role, OrgAdmin: organization roles)" })
  @ApiBody({ type: UpdateUserRoleRequest })
  @ApiOkResponse({ type: UserRoleItem })
  @ApiForbiddenResponse({ description: 'The caller cannot assign this role' })
  @ApiNotFoundResponse({ description: 'No user the caller can manage has this id' })
  @HttpCode(HttpStatus.OK)
  @Patch(':id/role')
  public async updateRole(
    @Sender() sender: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserRoleRequest,
  ): Promise<UserRoleItem> {
    this.logger.verbose({ id, role: body.role }, 'updateRole >')

    const result = await this.userRoleService.updateRole(sender, id, body)

    this.logger.verbose('updateRole <')
    return result
  }
}
