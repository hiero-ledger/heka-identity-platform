import { Controller, Post, Get, Param, Body, UseInterceptors, UseGuards, Put } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { TenantAgentInterceptor } from '../../common/agent'
import { AuthInfo, JwtAuthGuard, ReqAuthInfo, Role } from '../../common/auth'
import { RoleGuard, Roles } from '../../common/authz'
import { InjectLogger, Logger } from '../../common/logger'

import { CreateStatusListRequest, CreateStatusListResponse, StatusList, UpdateStatusListRequest } from './dto'
import { StatusListService } from './status-list.service'

@ApiTags('Bitstring Status List ')
@ApiBearerAuth()
@Controller('status-lists')
@ApiBadRequestResponse({ description: 'Bad Request' })
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class StatusListController {
  public constructor(
    private readonly statusListService: StatusListService,
    @InjectLogger(StatusListController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Create status list' })
  @ApiOkResponse({ type: CreateStatusListRequest })
  @Post()
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer)
  @UseInterceptors(TenantAgentInterceptor)
  public async create(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() body: CreateStatusListRequest,
  ): Promise<CreateStatusListResponse> {
    const logger = this.logger.child('create', { body })
    logger.trace('>')

    const res = await this.statusListService.create(authInfo, body)

    logger.trace({ res }, '<')
    return new CreateStatusListResponse({ id: res.id })
  }

  @ApiOperation({ summary: 'Update status list' })
  @ApiOkResponse({ type: UpdateStatusListRequest })
  @Put(':id')
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer)
  @UseInterceptors(TenantAgentInterceptor)
  public async update(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Param('id') id: string,
    @Body() body: UpdateStatusListRequest,
  ) {
    const logger = this.logger.child('update', { body })
    logger.trace('>')

    const res = await this.statusListService.updateItems(authInfo, id, body)

    logger.trace({ res }, '<')
  }

  @ApiOperation({ summary: 'Get status list' })
  @ApiOkResponse({ type: StatusList })
  @Get(':id')
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer)
  @UseInterceptors(TenantAgentInterceptor)
  public async get(@ReqAuthInfo() authInfo: AuthInfo, @Param('id') id: string): Promise<StatusList> {
    const logger = this.logger.child('get', { id })
    logger.trace('>')

    const res = await this.statusListService.get(authInfo, id)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get all created status lists' })
  @ApiOkResponse({ type: [StatusList] })
  @Get()
  public async find(@ReqAuthInfo() authInfo: AuthInfo): Promise<Array<StatusList>> {
    const logger = this.logger.child('find', {})
    logger.trace('>')

    const res = this.statusListService.find(authInfo)

    logger.trace({ res }, '<')
    return res
  }
}
