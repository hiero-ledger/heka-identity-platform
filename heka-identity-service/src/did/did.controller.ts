import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
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

import { DidService } from './did.service'
import { CreateDidRequestDto, DidDocumentDto, FindDidRequestDto, GetDidMethodsResponseDto } from './dto'

@ApiTags('Dids')
@ApiBearerAuth()
@Controller('dids')
@UseGuards(JwtAuthGuard, RoleGuard)
export class DidController {
  public constructor(
    @InjectLogger(DidController)
    private readonly logger: Logger,
    private readonly didService: DidService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get supported DIDs methods' })
  @ApiOkResponse({ description: 'DID methods', type: GetDidMethodsResponseDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get('/methods')
  @UseInterceptors(TenantAgentInterceptor)
  public getMethods(): GetDidMethodsResponseDto {
    const logger = this.logger.child('getMethods')
    logger.trace('>')

    const res = this.didService.getMethods()

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Get DIDs' })
  @ApiOkResponse({ description: 'DID documents', type: [DidDocumentDto] })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get()
  @UseInterceptors(TenantAgentInterceptor)
  public async find(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Query() req: FindDidRequestDto,
  ): Promise<DidDocumentDto[]> {
    const logger = this.logger.child('find', req)
    logger.trace('>')

    const res = await this.didService.find(tenantAgent, req)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Create a new public DID' })
  @ApiBody({ type: CreateDidRequestDto })
  @ApiCreatedResponse({ description: 'Created DID document', type: DidDocumentDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConflictResponse({ description: 'Conflict' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @Post()
  @Roles(Role.Admin, Role.OrgAdmin, Role.Issuer)
  public async create(@ReqAuthInfo() authInfo: AuthInfo, @Body() req: CreateDidRequestDto): Promise<DidDocumentDto> {
    const logger = this.logger.child('create', { authInfo })
    logger.trace('>')

    const res = this.didService.create(authInfo, req)

    logger.trace({ res }, '<')
    return res
  }

  @ApiOperation({ summary: 'Resolve a DID' })
  @ApiParam({ name: 'did', type: String })
  @ApiOkResponse({ description: 'DID document', type: DidDocumentDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @Get(':did')
  @UseInterceptors(TenantAgentInterceptor)
  public async get(@ReqTenantAgent() tenantAgent: TenantAgent, @Param('did') did: string): Promise<DidDocumentDto> {
    const logger = this.logger.child('get', { did })
    logger.trace('>')

    const res = this.didService.get(tenantAgent, did)

    logger.trace({ res }, '<')
    return res
  }
}
