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
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { JwtAuthGuard, Role } from 'common/auth'
import { RoleGuard, Roles } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import { CreateSchemaDto, FindSchemasDto, SchemaDto } from './dto'
import { SchemaService } from './schema.service'

@ApiBearerAuth()
@Controller({ path: 'schemas' })
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
@ApiBadRequestResponse({ description: 'Bad Request' })
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class SchemaController {
  public constructor(
    @InjectLogger(SchemaController)
    private readonly logger: Logger,
    private readonly schemaService: SchemaService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get created schemas' })
  @ApiOkResponse({ description: 'Schema Records', type: [SchemaDto] })
  @Get()
  public async find(@ReqTenantAgent() tenantAgent: TenantAgent, @Query() query: FindSchemasDto): Promise<SchemaDto[]> {
    const logger = this.logger.child('find', { tenantAgent, query })
    logger.trace('>')

    const res = this.schemaService.getCreated(tenantAgent, query)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Create a schema' })
  @ApiBody({ type: CreateSchemaDto })
  @ApiCreatedResponse({ description: 'Created schema', type: SchemaDto })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @Post()
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager)
  public async create(@ReqTenantAgent() tenantAgent: TenantAgent, @Body() req: CreateSchemaDto): Promise<SchemaDto> {
    const logger = this.logger.child('create', { req })
    logger.trace('>')

    const res = this.schemaService.create(tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get a schema from the ledger' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Schema Record', type: SchemaDto })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @Get(':id')
  public async get(@ReqTenantAgent() tenantAgent: TenantAgent, @Param('id') id: string): Promise<SchemaDto> {
    const logger = this.logger.child('get', { id })
    logger.trace('>')

    const res = this.schemaService.get(tenantAgent, id)

    logger.trace({ res }, '<')
    return res
  }
}
