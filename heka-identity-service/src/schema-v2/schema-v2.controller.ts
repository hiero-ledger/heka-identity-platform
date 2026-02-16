import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  //  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { RoleGuard } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import { ApiListResponse } from '../common/dto'
import { imageMulterOptions } from '../common/file-uploader/image.multer.options'
import { ImageUploadingValidationPipe } from '../common/file-uploader/validation.pipe'

import {
  CreateSchemaRequest,
  CreateSchemaResponse,
  GetSchemaResponse,
  GetSchemasListRequest,
  GetSchemasListResponse,
  GetSchemasListItem,
  PatchSchemaRequest,
  PatchSchemaResponse,
} from './dto'
import { GetSchemaRegistrationRequest, GetSchemaRegistrationResponse } from './dto/get-schema-registration'
import { RegisterSchemaRequest, RegisterSchemaResponse } from './dto/register-schema'
import { SchemaV2Service } from './schema-v2.service'

//@ApiTags('Schemas V2')
@Controller({ path: 'schemas', version: ['2'] })
@ApiBadRequestResponse({ description: 'Bad Request' })
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class SchemaV2Controller {
  public constructor(
    @InjectLogger(SchemaV2Controller)
    private readonly logger: Logger,
    private readonly schemaServiceV2: SchemaV2Service,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get schemas list' })
  @ApiListResponse({ listItemType: GetSchemasListItem, description: 'List of schemas' })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @ApiBearerAuth()
  @UseInterceptors(TenantAgentInterceptor)
  @Get()
  public async getSchemasList(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Query() request: GetSchemasListRequest,
  ): Promise<GetSchemasListResponse> {
    const logger = this.logger.child('getSchemasList', { authInfo })
    logger.trace('>')
    const res = await this.schemaServiceV2.getList(authInfo, request)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get schema details' })
  @ApiParam({ name: 'id', format: 'uuid', type: 'string', description: 'Schema id' })
  @ApiResponse({ type: GetSchemaResponse, description: 'Schema details' })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @ApiBearerAuth()
  @UseInterceptors(TenantAgentInterceptor)
  @Get(':id')
  public async getSchemaById(@Param('id') id: string, @ReqAuthInfo() authInfo: AuthInfo): Promise<GetSchemaResponse> {
    const logger = this.logger.child('getSchemaById', { id })
    logger.trace('>')
    const res = await this.schemaServiceV2.getById(authInfo, id)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Create schema' })
  @ApiBody({ type: CreateSchemaRequest })
  @ApiResponse({ type: CreateSchemaResponse })
  @UseInterceptors(FileInterceptor('logo', imageMulterOptions))
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @ApiBearerAuth()
  @UseInterceptors(TenantAgentInterceptor)
  @Post('')
  public async createSchema(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() request: CreateSchemaRequest,
    @UploadedFile(ImageUploadingValidationPipe(false)) logo: Express.Multer.File,
  ): Promise<CreateSchemaResponse> {
    const logger = this.logger.child('createSchema', { authInfo })
    logger.trace('>')
    const res = await this.schemaServiceV2.create(authInfo, request, logo)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Patch schema' })
  @ApiParam({ name: 'id', format: 'uuid', type: 'string', description: 'Schema id' })
  @ApiBody({ type: PatchSchemaRequest })
  @ApiResponse({ type: PatchSchemaResponse })
  @UseInterceptors(FileInterceptor('logo', imageMulterOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'Schema was patched' })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @ApiBearerAuth()
  @UseInterceptors(TenantAgentInterceptor)
  @Patch(':id')
  public async patchSchema(
    @ReqAuthInfo() authInfo: AuthInfo,
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('id') id: string,
    @Body() request: PatchSchemaRequest,
    @UploadedFile(ImageUploadingValidationPipe(false)) logo: Express.Multer.File,
  ): Promise<PatchSchemaResponse> {
    const logger = this.logger.child('patchSchema', { authInfo })
    logger.trace('>')
    const res = await this.schemaServiceV2.patch(authInfo, tenantAgent, id, request, logo)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Registration schema' })
  @ApiBody({ type: RegisterSchemaRequest })
  @ApiOkResponse({ description: 'Schema was registered', type: RegisterSchemaResponse })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @ApiBearerAuth()
  @UseInterceptors(TenantAgentInterceptor)
  @Post(':id/registration')
  public async registrationSchema(
    @ReqAuthInfo() authInfo: AuthInfo,
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('id') id: string,
    @Body() request: RegisterSchemaRequest,
  ): Promise<RegisterSchemaResponse> {
    const logger = this.logger.child('registrationSchema', { tenantAgent })
    logger.trace('>')
    const res = await this.schemaServiceV2.registration(authInfo, tenantAgent, id, request)
    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get schema registration detail' })
  @ApiParam({ name: 'id', format: 'uuid', type: 'string', description: 'Schema id' })
  @ApiOkResponse({ description: 'Schema registration details', type: GetSchemaRegistrationResponse })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @ApiBearerAuth()
  @UseInterceptors(TenantAgentInterceptor)
  @Get(':id/registration')
  public async getSchemaRegistration(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Param('id') id: string,
    @Query() request: GetSchemaRegistrationRequest,
  ): Promise<GetSchemaRegistrationResponse> {
    const logger = this.logger.child('getSchemaRegistration')
    logger.trace('>')
    const res = await this.schemaServiceV2.getRegistration(authInfo, id, request)
    logger.trace({ res }, '<')
    return res
  }
}
