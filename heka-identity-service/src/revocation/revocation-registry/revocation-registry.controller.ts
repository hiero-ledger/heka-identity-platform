import { Controller, Post, Get, Param, Body, UseInterceptors, UseGuards, Query } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from '../../common/agent'
import { JwtAuthGuard, Role } from '../../common/auth'
import { RoleGuard, Roles } from '../../common/authz'
import { InjectLogger, Logger } from '../../common/logger'

import {
  CreateRevocationRegistryRequest,
  CreateRevocationRegistryResponse,
  GetRevocationRegistryResponse,
  RevocationRegistry,
} from './dto'
import { RevocationRegistryService } from './revocation-registry.service'

@ApiTags('Anoncreds Revocation Registries')
@ApiBearerAuth()
@Controller('revocation-registries')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class RevocationRegistryController {
  public constructor(
    private readonly revocationRegistryService: RevocationRegistryService,
    @InjectLogger(RevocationRegistryController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Create revocation registry' })
  @ApiOkResponse({ type: CreateRevocationRegistryResponse })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Post()
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer)
  @UseInterceptors(TenantAgentInterceptor)
  public async create(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() body: CreateRevocationRegistryRequest,
  ): Promise<CreateRevocationRegistryResponse> {
    const logger = this.logger.child('create', { body })
    logger.trace('>')

    const res = await this.revocationRegistryService.create(tenantAgent, body)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get revocation registry' })
  @ApiOkResponse({ type: GetRevocationRegistryResponse })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiQuery({ name: 'timestamp', type: String, required: false })
  @Get(':id')
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  @UseInterceptors(TenantAgentInterceptor)
  public async get(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('id') id: string,
    @Query('timestamp') timestamp?: string,
  ): Promise<GetRevocationRegistryResponse> {
    const logger = this.logger.child('get', { id, timestamp })
    logger.trace('>')

    const res = await this.revocationRegistryService.get(tenantAgent, id, timestamp)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get created revocation registries' })
  @ApiQuery({ name: 'credDefId', type: String, required: false })
  @ApiOkResponse({ type: [RevocationRegistry] })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get()
  public async find(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Query('credDefId') credDefId?: string,
  ): Promise<Array<RevocationRegistry>> {
    const logger = this.logger.child('find', { tenantAgent })
    logger.trace('>')

    const res = this.revocationRegistryService.find(tenantAgent, credDefId)

    logger.trace({ res }, '<')
    return res
  }
}
