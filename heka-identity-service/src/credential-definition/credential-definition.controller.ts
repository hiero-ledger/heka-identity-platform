import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { JwtAuthGuard, Role } from 'common/auth'
import { RoleGuard, Roles } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import { CredentialDefinitionService } from './credential-definition.service'
import { CreateCredentialDefinitionDto, CredentialDefinitionDto } from './dto'

@ApiTags('Credential Definitions')
@ApiBearerAuth()
@Controller('credential-definitions')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class CredentialDefinitionController {
  public constructor(
    private readonly credentialDefinitionService: CredentialDefinitionService,
    @InjectLogger(CredentialDefinitionController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get created credential definitions' })
  @ApiQuery({ name: 'schemaId', type: String, required: false })
  @ApiOkResponse({ description: 'Credential Definition Records', type: [CredentialDefinitionDto] })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get()
  public async find(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Query('issuerId') issuerId?: string,
    @Query('schemaId') schemaId?: string,
  ): Promise<CredentialDefinitionDto[]> {
    const logger = this.logger.child('getCreated', { tenantAgent })
    logger.trace('>')

    const res = this.credentialDefinitionService.getCreated(tenantAgent, issuerId, schemaId)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Create a credential definition' })
  @ApiBody({ type: CreateCredentialDefinitionDto })
  @ApiCreatedResponse({ description: 'Credential Definition', type: CredentialDefinitionDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @Post()
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer)
  public async create(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: CreateCredentialDefinitionDto,
  ): Promise<CredentialDefinitionDto> {
    const logger = this.logger.child('create', { req })
    logger.trace('>')

    const res = await this.credentialDefinitionService.create(tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get a credential definition' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Credential Definition', type: CredentialDefinitionDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @Get(':id')
  public async get(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('id') id: string,
  ): Promise<CredentialDefinitionDto> {
    const logger = this.logger.child('get', { id })
    logger.trace('>')

    const res = await this.credentialDefinitionService.get(tenantAgent, id)

    logger.trace({ res }, '<')
    return res
  }
}
