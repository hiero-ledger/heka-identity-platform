import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { AuthInfo, JwtAuthGuard, ReqAuthInfo, Role } from 'common/auth'
import { RoleGuard, Roles } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import {
  OpenId4VcIssuanceSessionsCreateOfferDto,
  OpenId4VcIssuanceSessionsCreateOfferResponse,
  OpenId4VcIssuanceSessionRecordDto,
  GetIssuanceSessionByQueryDto,
} from './dto'
import { OpenId4VcIssuanceSessionService } from './issuance-session.service'

@ApiTags('OpenID4VC Issuance Session')
@ApiBearerAuth()
@Controller('openid4vc/issuance-session')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class OpenId4VcIssuanceSessionController {
  public constructor(
    private readonly issuanceService: OpenId4VcIssuanceSessionService,
    @InjectLogger(OpenId4VcIssuanceSessionController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  /**
   * Create an OpenID4VC issuance session by creating a credential offer
   */
  @ApiOperation({ summary: 'Offer a credential' })
  @ApiBody({ type: OpenId4VcIssuanceSessionsCreateOfferDto })
  @ApiOkResponse({ description: 'Credential Record', type: OpenId4VcIssuanceSessionsCreateOfferResponse })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @Post('offer')
  @HttpCode(200)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer)
  public async offer(
    @ReqAuthInfo() authInfo: AuthInfo,
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: OpenId4VcIssuanceSessionsCreateOfferDto,
  ): Promise<OpenId4VcIssuanceSessionsCreateOfferResponse> {
    const logger = this.logger.child('offer', { req })
    logger.trace('>')

    const res = await this.issuanceService.offer(authInfo, tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  /**
   * Find all OpenID4VC issuance sessions by query
   */
  @ApiOperation({ summary: 'Get a Issuance Sessions By Query ' })
  @ApiOkResponse({ description: 'Credential Record', type: OpenId4VcIssuanceSessionRecordDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @Get('/')
  public async getIssuanceSessionsByQuery(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Query() query: GetIssuanceSessionByQueryDto,
  ): Promise<OpenId4VcIssuanceSessionRecordDto[]> {
    const logger = this.logger.child('getIssuanceSessionsByQuery', query)
    logger.trace('>')

    const res = await this.issuanceService.getIssuanceSessionsByQuery(tenantAgent, query)

    logger.trace({ res }, '<')
    return res
  }

  /**
   * Get an OpenID4VC issuance session by issuance session id
   */
  @ApiOperation({ summary: 'Get a Issuance Sessions By Id ' })
  @ApiParam({ name: 'issuanceSessionId', type: String })
  @ApiOkResponse({ description: 'Credential Record', type: OpenId4VcIssuanceSessionRecordDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @Get(':issuanceSessionId')
  public async getIssuanceSession(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('issuanceSessionId') issuanceSessionId: string,
  ): Promise<OpenId4VcIssuanceSessionRecordDto> {
    const logger = this.logger.child('getIssuanceSession', { issuanceSessionId })
    logger.trace('>')

    const res = await this.issuanceService.getIssuanceSession(tenantAgent, issuanceSessionId)

    logger.trace({ res }, '<')
    return res
  }

  /**
   * Delete an OpenID4VC issuance session by id
   */
  @ApiOperation({ summary: 'Delete Issuance Session' })
  @ApiParam({ name: 'issuanceSessionId', type: String })
  @ApiOkResponse()
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @HttpCode(204)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer)
  @Delete(':issuanceSessionId')
  public async deleteIssuanceSession(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('issuanceSessionId') issuanceSessionId: string,
  ): Promise<void> {
    const logger = this.logger.child('deleteIssuanceSession', { issuanceSessionId })
    logger.trace('>')

    const res = await this.issuanceService.deleteIssuanceSession(tenantAgent, issuanceSessionId)

    logger.trace({ res }, '<')
  }

  @ApiOperation({ summary: 'Revoke a credential' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Post(':id/revoke')
  @HttpCode(200)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer)
  public async revoke(
    @ReqAuthInfo() authInfo: AuthInfo,
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('id') id: string,
  ): Promise<void> {
    const logger = this.logger.child('revoke', { id })
    logger.trace('>')

    await this.issuanceService.revokeIssuanceSession(authInfo, tenantAgent, id)

    logger.trace('<')
  }
}
