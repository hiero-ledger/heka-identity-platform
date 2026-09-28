import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { JwtAuthGuard, Role } from 'common/auth'
import { RoleGuard, Roles } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import { MdocDscDto, MdocIacaDto, MdocIssuerDto, ProvisionIacaDto } from './dto/mdoc-issuer.dto'
import { MdocIssuerCaService } from './mdoc-issuer-ca.service'

@ApiTags('mdoc Issuer CA')
@ApiBearerAuth()
@Controller('mdoc-issuers')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class MdocIssuerCaController {
  public constructor(
    private readonly mdocIssuerCaService: MdocIssuerCaService,
    @InjectLogger(MdocIssuerCaController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  /**
   * Provision the tenant's mdoc issuer: a self-signed IACA (idempotent) and a current DSC. Usually
   * done automatically during prepare-wallet; this endpoint is the explicit alternative.
   */
  @ApiOperation({ summary: 'Provision the tenant mdoc issuer (IACA + current DSC)' })
  @ApiOkResponse({ description: 'The mdoc issuer (IACA + DSCs)', type: MdocIssuerDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager)
  public async provision(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: ProvisionIacaDto,
  ): Promise<MdocIssuerDto> {
    const logger = this.logger.child('provision', { req })
    logger.trace('>')

    const iaca = await this.mdocIssuerCaService.provisionIaca(tenantAgent.context, req)
    await this.mdocIssuerCaService.ensureIssuer(tenantAgent.context)
    const dscs = await this.mdocIssuerCaService.listDsc(tenantAgent.context)

    logger.trace('<')
    return MdocIssuerDto.fromIssuer(iaca, dscs)
  }

  /**
   * Get the tenant's mdoc issuer (IACA + DSCs, with expiry observability). 404 until provisioned.
   */
  @ApiOperation({ summary: 'Get the tenant mdoc issuer' })
  @ApiOkResponse({ description: 'The mdoc issuer', type: MdocIssuerDto })
  @ApiNotFoundResponse({ description: 'No mdoc issuer provisioned yet' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get()
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async get(@ReqTenantAgent() tenantAgent: TenantAgent): Promise<MdocIssuerDto> {
    const logger = this.logger.child('get')
    logger.trace('>')

    const iaca = await this.mdocIssuerCaService.getIaca(tenantAgent.context)
    if (!iaca) {
      throw new NotFoundException('No mdoc issuer has been provisioned for this tenant')
    }
    const dscs = await this.mdocIssuerCaService.listDsc(tenantAgent.context)

    logger.trace('<')
    return MdocIssuerDto.fromIssuer(iaca, dscs)
  }

  /**
   * Get the tenant IACA certificate — the wallet trust anchor (also published via the VICAL).
   * 404 until provisioned.
   */
  @ApiOperation({ summary: 'Get the tenant IACA certificate' })
  @ApiOkResponse({ description: 'The IACA certificate', type: MdocIacaDto })
  @ApiNotFoundResponse({ description: 'No mdoc issuer provisioned yet' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get('iaca')
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async getIaca(@ReqTenantAgent() tenantAgent: TenantAgent): Promise<MdocIacaDto> {
    const logger = this.logger.child('getIaca')
    logger.trace('>')

    const iaca = await this.mdocIssuerCaService.getIaca(tenantAgent.context)
    if (!iaca) {
      throw new NotFoundException('No mdoc issuer has been provisioned for this tenant')
    }

    logger.trace('<')
    return MdocIacaDto.fromIaca(iaca)
  }

  /**
   * Issue (rotate) a fresh DSC under the existing IACA, retiring the prior current DSC from active
   * signing (it is retained so already-issued mdocs still verify). 400 if no IACA is provisioned.
   */
  @ApiOperation({ summary: 'Issue / rotate the tenant DSC' })
  @ApiOkResponse({ description: 'The new current DSC', type: MdocDscDto })
  @ApiBadRequestResponse({ description: 'No IACA provisioned' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Post('dsc')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager)
  public async issueDsc(@ReqTenantAgent() tenantAgent: TenantAgent): Promise<MdocDscDto> {
    const logger = this.logger.child('issueDsc')
    logger.trace('>')

    const dsc = await this.mdocIssuerCaService.issueDsc(tenantAgent.context)

    logger.trace('<')
    return MdocDscDto.fromDsc(dsc)
  }
}
