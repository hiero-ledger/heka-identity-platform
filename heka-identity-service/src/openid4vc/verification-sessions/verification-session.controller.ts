import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
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

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from '../../common/agent'
import { JwtAuthGuard, Role } from '../../common/auth'
import { RoleGuard, Roles } from '../../common/authz'
import { InjectLogger, Logger } from '../../common/logger'

import {
  OpenId4VcVerificationSessionCreateRequestDto,
  OpenId4VcVerificationSessionCreateRequestResponse,
  GetVerificationSessionByQueryDto,
  OpenId4VcVerificationSessionRecordDto,
} from './dto'
import { OpenId4VcVerificationSessionService } from './verification-session.service'

@ApiTags('OpenID4VC Verification Sessions')
@ApiBearerAuth()
@Controller('openid4vc/verification-session')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class OpenId4VcVerificationSessionController {
  public constructor(
    private readonly verificationService: OpenId4VcVerificationSessionService,
    @InjectLogger(OpenId4VcVerificationSessionController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  /**
   * Create an OpenID4VC verification session by creating an authorization request
   */
  @ApiOperation({ summary: 'Create an presentation request' })
  @ApiBody({ type: OpenId4VcVerificationSessionCreateRequestDto })
  @ApiOkResponse({
    description: 'Verification session record',
    type: OpenId4VcVerificationSessionCreateRequestResponse,
  })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @Post('request')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async createRequest(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: OpenId4VcVerificationSessionCreateRequestDto,
  ): Promise<OpenId4VcVerificationSessionCreateRequestResponse> {
    const logger = this.logger.child('createRequest', { req })
    logger.trace('>')

    const res = await this.verificationService.createRequest(tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  /**
   * Find all OpenID4VC verification sessions by query
   */
  @ApiOperation({ summary: 'Get Verification Sessions By Query ' })
  @ApiOkResponse({
    description: 'Verification session records',
    isArray: true,
    type: OpenId4VcVerificationSessionRecordDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @Get('/')
  public async getVerificationSessionsByQuery(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Query() query: GetVerificationSessionByQueryDto,
  ): Promise<OpenId4VcVerificationSessionRecordDto[]> {
    const logger = this.logger.child('getVerificationSessionsByQuery', { query })
    logger.trace('>')

    const res = await this.verificationService.getVerificationSessionsByQuery(tenantAgent, query)

    logger.trace({ res }, '<')
    return res
  }

  /**
   * Get an OpenID4VC verification session by verification session id
   */
  @ApiOperation({ summary: 'Get a Verification Session By Id ' })
  @ApiParam({ name: 'verificationSessionId', type: String })
  @ApiOkResponse({ description: 'Verification session record', type: OpenId4VcVerificationSessionRecordDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @Get(':verificationSessionId')
  public async getVerificationSession(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('verificationSessionId') verificationSessionId: string,
  ): Promise<OpenId4VcVerificationSessionRecordDto> {
    const logger = this.logger.child('getVerificationSessions', { verificationSessionId })
    logger.trace('>')

    const res = await this.verificationService.getVerificationSession(tenantAgent, verificationSessionId)

    logger.trace({ res }, '<')
    return res
  }

  /**
   * Delete an OpenID4VC verification session by id
   */
  @ApiOperation({ summary: 'Delete Verification Session' })
  @ApiParam({ name: 'verificationSessionId', type: String })
  @ApiOkResponse()
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  @Delete('/{verificationSessionId}')
  public async deleteVerificationSession(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('verificationSessionId') verificationSessionId: string,
  ): Promise<void> {
    const logger = this.logger.child('deleteVerificationSession', { verificationSessionId })
    logger.trace('>')

    const res = await this.verificationService.deleteVerificationSession(tenantAgent, verificationSessionId)

    logger.trace({ res }, '<')
  }
}
