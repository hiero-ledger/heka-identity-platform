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

import { ProofRecordDto, ProofRequestDto } from './dto'
import { ProofService } from './proof.service'

@ApiTags('Proofs')
@ApiBearerAuth()
@Controller('proofs')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class ProofController {
  public constructor(
    private readonly proofService: ProofService,
    @InjectLogger(ProofController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get all proof records' })
  @ApiQuery({ name: 'threadId', type: String, required: false })
  @ApiOkResponse({ description: 'Proof Records', type: [ProofRecordDto] })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @RequireCapability(Capability.Read)
  @Get()
  public async find(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Query('threadId') threadId?: string,
  ): Promise<ProofRecordDto[]> {
    const logger = this.logger.child('find', { threadId })
    logger.trace('>')

    const res = await this.proofService.find(tenantAgent, threadId)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Request a proof' })
  @ApiBody({ type: ProofRequestDto })
  @ApiOkResponse({ description: 'Proof Record', type: ProofRecordDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @RequireCapability(Capability.Verify)
  @Post('request')
  @HttpCode(200)
  public async request(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: ProofRequestDto,
  ): Promise<ProofRecordDto> {
    const logger = this.logger.child('request', { req })
    logger.trace('>')

    const res = await this.proofService.request(tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get a proof record' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Proof Record', type: ProofRecordDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @RequireCapability(Capability.Read)
  @Get(':id')
  public async get(@ReqTenantAgent() tenantAgent: TenantAgent, @Param('id') id: string): Promise<ProofRecordDto> {
    const logger = this.logger.child('get', { id })
    logger.trace('>')

    const res = await this.proofService.get(tenantAgent, id)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Present a proof' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Proof Record', type: ProofRecordDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @ApiConflictResponse({ description: 'Conflict' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @RequireCapability(Capability.Hold)
  @Post(':id/present')
  @HttpCode(200)
  public async present(@ReqTenantAgent() tenantAgent: TenantAgent, @Param('id') id: string): Promise<ProofRecordDto> {
    const logger = this.logger.child('present', { id })
    logger.trace('>')

    const res = await this.proofService.present(tenantAgent, id)

    logger.trace({ res }, '<')
    return res
  }
}
