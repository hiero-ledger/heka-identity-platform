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
  CreateIssuanceTemplateRequest,
  CreateIssuanceTemplateResponse,
  GetIssuanceTemplateResponse,
  GetIssuanceTemplatesListItem,
  GetIssuanceTemplatesListRequest,
  GetIssuanceTemplatesListResponse,
  PatchIssuanceTemplateRequest,
  PatchIssuanceTemplateResponse,
} from './dto'
import { IssuanceTemplateService } from './issuance-template.service'

@ApiTags('Issuance Templates')
@ApiBearerAuth()
@Controller({ path: 'issuance-templates' })
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
@ApiBadRequestResponse({ description: 'Bad Request' })
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class IssuanceTemplateController {
  public constructor(
    @InjectLogger(IssuanceTemplateController)
    private readonly logger: Logger,
    private readonly issuanceTemplateService: IssuanceTemplateService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get templates list' })
  @ApiListResponse({ listItemType: GetIssuanceTemplatesListItem, description: 'List of templates' })
  @Get()
  public async getTemplatesList(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Query() request: GetIssuanceTemplatesListRequest,
  ): Promise<GetIssuanceTemplatesListResponse> {
    const logger = this.logger.child('getTemplatesList', { authInfo })
    logger.trace('>')
    const res = await this.issuanceTemplateService.getList(authInfo, request)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get template details' })
  @ApiParam({ name: 'id', format: 'uuid', type: 'string', description: 'Template id' })
  @ApiResponse({ type: GetIssuanceTemplateResponse, description: 'Template details' })
  @Get(':id')
  public async getTemplateById(
    @Param('id') id: string,
    @ReqAuthInfo() authInfo: AuthInfo,
  ): Promise<GetIssuanceTemplateResponse> {
    const logger = this.logger.child('getTemplateById', { id })
    logger.trace('>')
    const res = await this.issuanceTemplateService.getById(authInfo, id)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Create template' })
  @ApiBody({ type: CreateIssuanceTemplateRequest })
  @ApiResponse({ type: CreateIssuanceTemplateResponse })
  @Post('')
  public async createTemplate(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() request: CreateIssuanceTemplateRequest,
  ): Promise<CreateIssuanceTemplateResponse> {
    const logger = this.logger.child('createTemplate', { authInfo })
    logger.trace('>')
    const res = await this.issuanceTemplateService.create(authInfo, request)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Patch template' })
  @ApiParam({ name: 'id', format: 'uuid', type: 'string', description: 'Template id' })
  @ApiBody({ type: PatchIssuanceTemplateRequest })
  @ApiResponse({ type: PatchIssuanceTemplateResponse })
  @ApiOkResponse()
  @Patch(':id')
  public async patchTemplate(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Param('id') id: string,
    @Body() request: PatchIssuanceTemplateRequest,
  ): Promise<PatchIssuanceTemplateResponse> {
    const logger = this.logger.child('patchTemplate', { authInfo })
    logger.trace('>')
    const res = await this.issuanceTemplateService.patch(authInfo, id, request)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Delete template' })
  @ApiParam({ name: 'id', format: 'uuid', type: 'string', description: 'Template id' })
  @ApiOkResponse()
  @Delete(':id')
  public async deleteTemplate(@ReqAuthInfo() authInfo: AuthInfo, @Param('id') id: string): Promise<void> {
    const logger = this.logger.child('deleteTemplate', { authInfo })
    logger.trace('>')
    await this.issuanceTemplateService.delete(authInfo, id)
    logger.trace('<')
  }
}
