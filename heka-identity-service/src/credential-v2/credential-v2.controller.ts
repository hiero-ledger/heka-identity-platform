import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { RoleGuard } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'
import { CredentialV2Service } from 'credential-v2/credential-v2.service'
import { OfferByIssuanceTemplateRequest, OfferByIssuanceTemplateResponse } from 'credential-v2/dto'
import {
  ProofByVerificationTemplateRequest,
  ProofByVerificationTemplateResponse,
} from 'credential-v2/dto/proof-by-template'

@ApiTags('Credentials V2')
@ApiBearerAuth()
@Controller({ path: 'credentials', version: ['2'] })
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
@ApiBadRequestResponse({ description: 'Bad Request' })
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class CredentialV2Controller {
  public constructor(
    @InjectLogger(CredentialV2Controller) private readonly logger: Logger,
    private readonly credentialV2Service: CredentialV2Service,
  ) {}

  @ApiOperation({ summary: 'Make VC offer by template' })
  @ApiBody({ type: OfferByIssuanceTemplateRequest })
  @ApiResponse({ type: OfferByIssuanceTemplateResponse })
  @Post('offer-by-template')
  public async offerByTemplate(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() request: OfferByIssuanceTemplateRequest,
  ): Promise<OfferByIssuanceTemplateResponse> {
    const logger = this.logger.child('vcOfferByTemplate', { authInfo })
    logger.trace('>')
    const res = await this.credentialV2Service.offerByTemplate(tenantAgent, authInfo, request)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Proof VC by template' })
  @ApiBody({ type: ProofByVerificationTemplateRequest })
  @ApiResponse({ type: ProofByVerificationTemplateResponse })
  @Post('proof-by-template')
  public async proofByTemplate(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() request: ProofByVerificationTemplateRequest,
  ): Promise<ProofByVerificationTemplateResponse> {
    const logger = this.logger.child('vcProofByTemplate', { authInfo })
    logger.trace('>')
    const res = await this.credentialV2Service.proofByTemplate(tenantAgent, authInfo, request)
    logger.trace({ res }, '<')
    return res
  }
}
