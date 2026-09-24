import { Body, Controller, Get, HttpCode, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { Capability, RequireCapability, RoleGuard } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import { ConnectionService } from './connection.service'
import {
  AcceptInvitationDto,
  ConnectionRecordDto,
  CreateInvitationRequestDto,
  CreateInvitationResponseDto,
} from './dto'

@ApiTags('Connections')
@ApiBearerAuth()
@Controller('connections')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class ConnectionController {
  public constructor(
    private readonly connectionService: ConnectionService,
    @InjectLogger(ConnectionController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get all connections' })
  @ApiOkResponse({ description: 'Connections', type: [ConnectionRecordDto] })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @RequireCapability(Capability.Read)
  @Get()
  public async find(@ReqTenantAgent() tenantAgent: TenantAgent): Promise<ConnectionRecordDto[]> {
    const logger = this.logger.child('find')
    logger.trace('>')

    const res = await this.connectionService.find(tenantAgent)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Create an invitation' })
  @ApiBody({ type: CreateInvitationRequestDto })
  @ApiOkResponse({ description: 'Invitation', type: CreateInvitationResponseDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @RequireCapability(Capability.Connect)
  @Post('create-invitation')
  @HttpCode(200)
  public async createInvitation(
    @ReqAuthInfo() authInfo: AuthInfo,
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: CreateInvitationRequestDto,
  ): Promise<CreateInvitationResponseDto> {
    const logger = this.logger.child('createInvitation', { req })
    logger.trace('>')

    const res = await this.connectionService.createInvitation(authInfo, tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Accept an invitation' })
  @ApiBody({ type: AcceptInvitationDto })
  @ApiOkResponse({ description: 'Connection', type: ConnectionRecordDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @RequireCapability(Capability.Hold)
  @Post('accept-invitation')
  @HttpCode(200)
  public async acceptInvitation(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: AcceptInvitationDto,
  ): Promise<ConnectionRecordDto> {
    const logger = this.logger.child('acceptInvitation', { req })
    logger.trace('>')

    const res = await this.connectionService.acceptInvitation(tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get a connection' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Connection', type: ConnectionRecordDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @RequireCapability(Capability.Read)
  @Get(':id')
  public async get(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('id') id: string,
  ): Promise<ConnectionRecordDto | null> {
    const logger = this.logger.child('get', { id })
    logger.trace('>')

    const res = await this.connectionService.get(tenantAgent, id)

    logger.trace({ res }, '<')
    return res
  }
}
