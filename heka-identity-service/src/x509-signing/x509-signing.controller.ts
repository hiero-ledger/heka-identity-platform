import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'

import { ReqTenantAgent, TenantAgent, TenantAgentInterceptor } from 'common/agent'
import { JwtAuthGuard, Role } from 'common/auth'
import { RoleGuard, Roles } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import {
  CreateX509CsrDto,
  ImportSignedCertificateDto,
  ProvisionX509SignerDto,
  RotateX509SignerDto,
  X509CsrDto,
  X509RootCertificateDto,
  X509SignerDto,
} from './dto/x509-signer.dto'
import { X509SignerService } from './x509-signer.service'

@ApiTags('X.509 Signers')
@ApiBearerAuth()
@Controller('x509/signers')
@UseGuards(JwtAuthGuard, RoleGuard)
@UseInterceptors(TenantAgentInterceptor)
export class X509SignerController {
  public constructor(
    private readonly x509SignerService: X509SignerService,
    @InjectLogger(X509SignerController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  /**
   * Provision a per-tenant X.509 signer (P-256 key → self-signed cert + did:jwk).
   */
  @ApiOperation({ summary: 'Provision an X.509 signer' })
  @ApiOkResponse({ description: 'Signer', type: X509SignerDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async provision(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: ProvisionX509SignerDto,
  ): Promise<X509SignerDto> {
    const logger = this.logger.child('provision', { req })
    logger.trace('>')

    const identity = await this.x509SignerService.provision(tenantAgent, req)

    logger.trace('<')
    return X509SignerDto.fromSigner(identity)
  }

  /**
   * List the tenant's provisioned X.509 signers.
   */
  @ApiOperation({ summary: 'List X.509 signers' })
  @ApiOkResponse({ description: 'Signers', isArray: true, type: X509SignerDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get()
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async list(@ReqTenantAgent() tenantAgent: TenantAgent): Promise<X509SignerDto[]> {
    const logger = this.logger.child('list')
    logger.trace('>')

    const identities = await this.x509SignerService.list(tenantAgent)

    logger.trace('<')
    return identities.map((identity) => X509SignerDto.fromSigner(identity))
  }

  /**
   * Get the service-wide root CA certificate — register it as the wallet's trust anchor for the
   * x509_san_dns model. 404 until the first x509_san_dns identity is provisioned (the root is lazy).
   */
  @ApiOperation({ summary: 'Get the service X.509 root CA certificate (x509_san_dns trust anchor)' })
  @ApiOkResponse({ description: 'Root CA certificate', type: X509RootCertificateDto })
  @ApiNotFoundResponse({ description: 'No root CA provisioned yet' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get('root-certificate')
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async getRootCertificate(): Promise<X509RootCertificateDto> {
    const logger = this.logger.child('getRootCertificate')
    logger.trace('>')

    const root = await this.x509SignerService.getServiceRootCertificate()
    if (!root) {
      throw new NotFoundException('No service root CA has been provisioned yet')
    }

    logger.trace('<')
    return root
  }

  /**
   * Create a CSR for a fresh tenant key (external-CA / x509_san_dns alternative). Submit the returned
   * CSR to your CA, then mount the signed leaf via POST /import using the returned keyId.
   */
  @ApiOperation({ summary: 'Create a CSR for external-CA x509_san_dns issuance' })
  @ApiOkResponse({ description: 'CSR + keyId', type: X509CsrDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Post('csr')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async createCsr(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: CreateX509CsrDto,
  ): Promise<X509CsrDto> {
    const logger = this.logger.child('createCsr', { req })
    logger.trace('>')

    const csr = await this.x509SignerService.createSigningCsr(tenantAgent, req)

    logger.trace('<')
    return csr
  }

  /**
   * Mount an externally-signed certificate (for a key created via POST /csr) as a signer.
   */
  @ApiOperation({ summary: 'Import an externally-signed X.509 certificate' })
  @ApiOkResponse({ description: 'Signer', type: X509SignerDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async importCertificate(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Body() req: ImportSignedCertificateDto,
  ): Promise<X509SignerDto> {
    const logger = this.logger.child('importCertificate')
    logger.trace('>')

    const identity = await this.x509SignerService.importSignedCertificate(tenantAgent, req)

    logger.trace('<')
    return X509SignerDto.fromSigner(identity)
  }

  // ── Lifecycle (M3) ─────────────────────────────────────────────────────────
  // Declared after the literal `root-certificate`/`csr`/`import` routes so those win over `:id`.

  /**
   * Get a single signer by id (includes expiry observability fields).
   */
  @ApiOperation({ summary: 'Get an X.509 signer' })
  @ApiParam({ name: 'id', description: 'Signer id' })
  @ApiOkResponse({ description: 'Signer', type: X509SignerDto })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get(':id')
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async get(@ReqTenantAgent() tenantAgent: TenantAgent, @Param('id') id: string): Promise<X509SignerDto> {
    const logger = this.logger.child('get', { id })
    logger.trace('>')

    const identity = await this.x509SignerService.get(tenantAgent, id)

    logger.trace('<')
    return X509SignerDto.fromSigner(identity)
  }

  /**
   * Make this identity the default for its clientIdPrefix (used when a request omits a certificateId).
   */
  @ApiOperation({ summary: 'Set an X.509 signer as the default for its clientIdPrefix' })
  @ApiParam({ name: 'id', description: 'Signer id' })
  @ApiOkResponse({ description: 'Updated signer', type: X509SignerDto })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async setDefault(@ReqTenantAgent() tenantAgent: TenantAgent, @Param('id') id: string): Promise<X509SignerDto> {
    const logger = this.logger.child('setDefault', { id })
    logger.trace('>')

    const identity = await this.x509SignerService.setDefault(tenantAgent, id)

    logger.trace('<')
    return X509SignerDto.fromSigner(identity)
  }

  /**
   * Rotate an identity: reissue a fresh key + certificate (same prefix/SAN/common-name/did, inheriting
   * the default flag) and retire the old one. For x509_hash, push the returned fingerprint to the
   * wallet trust list in lockstep; for x509_san_dns the leaf re-chains to the same root (no wallet change).
   */
  @ApiOperation({ summary: 'Rotate an X.509 signer (reissue key + certificate)' })
  @ApiParam({ name: 'id', description: 'Signer id to rotate' })
  @ApiOkResponse({ description: 'The new signer', type: X509SignerDto })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiUnprocessableEntityResponse({ description: 'Unprocessable Entity' })
  @Post(':id/rotate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async rotate(
    @ReqTenantAgent() tenantAgent: TenantAgent,
    @Param('id') id: string,
    @Body() req: RotateX509SignerDto,
  ): Promise<X509SignerDto> {
    const logger = this.logger.child('rotate', { id, req })
    logger.trace('>')

    const identity = await this.x509SignerService.rotate(tenantAgent, id, req)

    logger.trace('<')
    return X509SignerDto.fromSigner(identity)
  }

  /**
   * Delete a signer (and best-effort its backing KMS key).
   */
  @ApiOperation({ summary: 'Delete an X.509 signer' })
  @ApiParam({ name: 'id', description: 'Signer id' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Not Found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier)
  public async delete(@ReqTenantAgent() tenantAgent: TenantAgent, @Param('id') id: string): Promise<void> {
    const logger = this.logger.child('delete', { id })
    logger.trace('>')

    await this.x509SignerService.delete(tenantAgent, id)

    logger.trace('<')
  }
}
