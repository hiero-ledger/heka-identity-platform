import { Controller, UseGuards, UseInterceptors, Post, Body, Get, Query, Put, Param, HttpCode } from '@nestjs/common'
import {
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { JwtAuthGuard, Role } from 'common/auth'
import { RoleGuard, Roles } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import {
  OpenId4VcIssuersCreateDto,
  OpenId4VcIssuersUpdateMetadataDto,
  OpenId4VcIssuerRecordDto,
  FindIssuerDto,
  FindSupportedCredentialsDto,
} from './dto'
import { OpenId4VciCredentialConfigurationSupportedWithId } from './dto/common/credential'
import { OpenId4VcIssuerService } from './issuer.service'

@ApiTags('OpenID4VC Issuer')
@ApiBearerAuth()
@Controller('/openid4vc/issuer')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class OpenId4VcIssuerController {
  public constructor(
    private readonly issuerService: OpenId4VcIssuerService,
    @InjectLogger(OpenId4VcIssuerController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get issuer records' })
  @ApiOkResponse({ description: 'Issuer records', isArray: true, type: OpenId4VcIssuerRecordDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get()
  public async find(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Query() query: FindIssuerDto,
  ): Promise<OpenId4VcIssuerRecordDto[]> {
    const logger = this.logger.child('find', query)
    logger.trace('>')

    const res = await this.issuerService.find(tenantAgent, query.publicIssuerId)

    logger.trace({ res }, '<')
    return res
  }

  /**
   * Create a new OpenID4VCI Issuer
   */
  @ApiOperation({ summary: 'Create an Issuer' })
  @ApiBody({ type: OpenId4VcIssuersCreateDto })
  @ApiOkResponse({ description: 'Issuer Record', type: OpenId4VcIssuerRecordDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @Post()
  @HttpCode(200)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer)
  public async create(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: OpenId4VcIssuersCreateDto,
  ): Promise<OpenId4VcIssuerRecordDto> {
    const logger = this.logger.child('create', { req })
    logger.trace('>')

    const res = await this.issuerService.createIssuer(tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  /**
   * Update issuer metadata (`display` and `credentialsSupported`).
   *
   * NOTE: this method overwrites the existing metadata with the new metadata, so
   * make sure to include all the metadata you want to keep in the new metadata.
   */
  @ApiOperation({ summary: 'Update an Issuer Metadata' })
  @ApiBody({ type: OpenId4VcIssuersUpdateMetadataDto })
  @ApiOkResponse({ description: 'Issuer Record', type: OpenId4VcIssuerRecordDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @HttpCode(200)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer)
  @Put(':issuerId')
  public async update(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('issuerId') issuerId: string,
    @Body() req: OpenId4VcIssuersUpdateMetadataDto,
  ): Promise<OpenId4VcIssuerRecordDto> {
    const logger = this.logger.child('update', { req })
    logger.trace('>')

    const res = await this.issuerService.updateIssuerMetadata(tenantAgent, issuerId, req)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get supported issuer credentials' })
  @ApiOkResponse({
    description: 'Supported credential',
    isArray: true,
    type: OpenId4VciCredentialConfigurationSupportedWithId,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get('/supported-credentials')
  public async supportedCredentials(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Query() query: FindSupportedCredentialsDto,
  ): Promise<OpenId4VciCredentialConfigurationSupportedWithId[]> {
    const logger = this.logger.child('credentials', query)
    logger.trace('>')

    const res = await this.issuerService.supportedCredentials(tenantAgent, query)

    logger.trace({ res }, '<')
    return res
  }
}
