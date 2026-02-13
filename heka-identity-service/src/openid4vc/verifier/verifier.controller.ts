import { Controller, UseGuards, UseInterceptors, Post, Body, Get, Query, HttpCode, HttpStatus } from '@nestjs/common'
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

import { OpenId4VcVerifierCreateDto, OpenId4VcVerifierRecordDto, FindVerifierDto } from './dto'
import { OpenId4VcVerifierService } from './verifier.service'

@ApiTags('OpenID4VC Verifier')
@ApiBearerAuth()
@Controller('/openid4vc/verifier')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class OpenId4VcVerifierController {
  public constructor(
    private readonly verifierService: OpenId4VcVerifierService,
    @InjectLogger(OpenId4VcVerifierController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  /**
   * Create a new OpenID4VCI Verifier
   */
  @ApiOperation({ summary: 'Create a Verifier' })
  @ApiBody({ type: OpenId4VcVerifierCreateDto })
  @ApiOkResponse({ description: 'Verifier Record', type: OpenId4VcVerifierRecordDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async create(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: OpenId4VcVerifierCreateDto,
  ): Promise<OpenId4VcVerifierRecordDto> {
    const logger = this.logger.child('create', { req })
    logger.trace('>')

    const res = await this.verifierService.createVerifier(tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  /**
   * Get an OpenID4VCI Verifier records
   */
  @ApiOperation({ summary: 'Get verifier records' })
  @ApiOkResponse({ description: 'Verifier records', isArray: true, type: OpenId4VcVerifierRecordDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get()
  public async find(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Query() query: FindVerifierDto,
  ): Promise<OpenId4VcVerifierRecordDto[]> {
    const logger = this.logger.child('find', query)
    logger.trace('>')

    const res = await this.verifierService.find(tenantAgent, query.publicVerifierId)

    logger.trace({ res }, '<')
    return res
  }
}
