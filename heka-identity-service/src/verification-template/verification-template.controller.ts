import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { TenantAgentInterceptor } from 'common/agent'
import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { RoleGuard } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import { ApiListResponse } from '../common/dto'

import {
  CreateVerificationTemplateRequest,
  CreateVerificationTemplateResponse,
  GetVerificationTemplateResponse,
  GetVerificationTemplatesListRequest,
  GetVerificationTemplatesListResponse,
  GetVerificationTemplatesListItem,
  PatchVerificationTemplateRequest,
} from './dto'
import { VerificationTemplateService } from './verification-template.service'

@ApiTags('Verification Templates')
@ApiBearerAuth()
@Controller({ path: 'verification-templates' })
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
@ApiBadRequestResponse({ description: 'Bad Request' })
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class VerificationTemplateController {
  public constructor(
    @InjectLogger(VerificationTemplateController)
    private readonly logger: Logger,
    private readonly verificationTemplateService: VerificationTemplateService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get templates list' })
  @ApiListResponse({ listItemType: GetVerificationTemplatesListItem, description: 'List of templates' })
  @Get()
  public async getTemplatesList(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Query() request: GetVerificationTemplatesListRequest,
  ): Promise<GetVerificationTemplatesListResponse> {
    const logger = this.logger.child('getTemplatesList', { authInfo })
    logger.trace('>')
    const res = await this.verificationTemplateService.getList(authInfo, request)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get template details' })
  @ApiParam({ name: 'id', format: 'uuid', type: 'string', description: 'Template id' })
  @ApiResponse({ type: GetVerificationTemplateResponse, description: 'Template details' })
  @Get(':id')
  public async getTemplateById(
    @Param('id') id: string,
    @ReqAuthInfo() authInfo: AuthInfo,
  ): Promise<GetVerificationTemplateResponse> {
    const logger = this.logger.child('getTemplateById', { id })
    logger.trace('>')
    const res = await this.verificationTemplateService.getById(authInfo, id)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Create template' })
  @ApiBody({ type: CreateVerificationTemplateRequest })
  @ApiResponse({ type: CreateVerificationTemplateResponse, description: 'Created template id' })
  @Post('')
  public async createTemplate(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() request: CreateVerificationTemplateRequest,
  ): Promise<CreateVerificationTemplateResponse> {
    const logger = this.logger.child('createTemplate', { authInfo })
    logger.trace('>')
    const res = await this.verificationTemplateService.create(authInfo, request)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Patch template' })
  @ApiParam({ name: 'id', format: 'uuid', type: 'string', description: 'Template id' })
  @ApiBody({ type: PatchVerificationTemplateRequest })
  @ApiOkResponse()
  @Patch(':id')
  public async patchTemplate(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Param('id') id: string,
    @Body() request: PatchVerificationTemplateRequest,
  ): Promise<void> {
    const logger = this.logger.child('patchTemplate', { authInfo })
    logger.trace('>')
    await this.verificationTemplateService.patch(authInfo, id, request)
    logger.trace('<')
  }

  @ApiOperation({ summary: 'Delete template' })
  @ApiParam({ name: 'id', format: 'uuid', type: 'string', description: 'Template id' })
  @ApiOkResponse()
  @Delete(':id')
  public async deleteTemplate(@ReqAuthInfo() authInfo: AuthInfo, @Param('id') id: string): Promise<void> {
    const logger = this.logger.child('deleteTemplate', { authInfo })
    logger.trace('>')
    await this.verificationTemplateService.delete(authInfo, id)
    logger.trace('<')
  }
}
