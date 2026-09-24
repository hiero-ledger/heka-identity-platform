import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
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
import { JwtAuthGuard } from 'common/auth'
import { Capability, RequireCapability, RoleGuard } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import { CredentialService } from './credential.service'
import { CredentialOfferDto, CredentialRecordDto } from './dto'
import { CredentialConfigDto } from './dto/credential-config.dto'

@ApiTags('Credentials')
@ApiBearerAuth()
@Controller('credentials')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class CredentialController {
  public constructor(
    private readonly credentialService: CredentialService,
    @InjectLogger(CredentialController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get all credential records' })
  @ApiQuery({ name: 'threadId', type: String, required: false })
  @ApiOkResponse({ description: 'Credential Records', type: [CredentialRecordDto] })
  @RequireCapability(Capability.Read)
  @Get()
  public async find(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Query('threadId') threadId?: string,
  ): Promise<CredentialRecordDto[]> {
    const logger = this.logger.child('find', { threadId })
    logger.trace('>')

    const res = await this.credentialService.find(tenantAgent, threadId)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Offer a credential' })
  @ApiBody({ type: CredentialOfferDto })
  @ApiOkResponse({ description: 'Credential Record', type: CredentialRecordDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @RequireCapability(Capability.Issue)
  @Post('offer')
  @HttpCode(200)
  public async offer(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: CredentialOfferDto,
  ): Promise<CredentialRecordDto> {
    const logger = this.logger.child('offer', { req })
    logger.trace('>')

    const res = await this.credentialService.offer(tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  // NOTE: this route should be defined BEFORE get() since they conflict
  @ApiOperation({ summary: 'Get available protocols and their cred types and networks' })
  @ApiOkResponse({ description: 'Credential config', type: CredentialConfigDto })
  @RequireCapability(Capability.Read)
  @Get('config')
  public async types(): Promise<CredentialConfigDto> {
    const logger = this.logger.child('types')
    logger.trace('>')

    const res = await this.credentialService.types()

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get a credential record' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Credential Record', type: CredentialRecordDto })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @RequireCapability(Capability.Read)
  @Get(':id')
  public async get(@ReqTenantAgent() tenantAgent: TenantAgent, @Param('id') id: string): Promise<CredentialRecordDto> {
    const logger = this.logger.child('get', { id })
    logger.trace('>')

    const res = await this.credentialService.get(tenantAgent, id)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Accept a credential offer' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Credential Record', type: CredentialRecordDto })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @ApiConflictResponse({ description: 'Conflict' })
  @RequireCapability(Capability.Hold)
  @Post(':id/accept')
  @HttpCode(200)
  public async accept(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('id') id: string,
  ): Promise<CredentialRecordDto> {
    const logger = this.logger.child('accept', { id })
    logger.trace('>')

    const res = await this.credentialService.accept(tenantAgent, id)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Revoke a credential' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @RequireCapability(Capability.Issue)
  @Post(':id/revoke')
  @HttpCode(200)
  public async revoke(@ReqTenantAgent() tenantAgent: TenantAgent, @Param('id') id: string): Promise<void> {
    const logger = this.logger.child('revoke', { id })
    logger.trace('>')

    await this.credentialService.revoke(tenantAgent, id)

    logger.trace('<')
  }
}
