import { Controller, Get, Header, NotFoundException, Param, StreamableFile } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { InjectLogger, Logger } from 'common/logger'

import { MdocIssuerCaService } from './mdoc-issuer-ca.service'

/** RFC 2585 media type of a single DER certificate. */
export const PKIX_CERT_MIME_TYPE = 'application/pkix-cert'

/**
 * Public, tenant-less download of a tenant IACA certificate by SHA-256 fingerprint — the
 * `id-ad-caIssuers` access location that EU-profile DSCs carry in their Authority Information Access
 * extension (ETSI TS 119 412-6 PID-4.4.3: a CA-issued sign/seal certificate points at a valid
 * certificate of its issuing CA over http(s)). Only public certificates are served, from the global
 * IACA registry.
 */
@ApiTags('mdoc Issuer CA')
@Controller('mdoc-issuers/certificates')
export class IacaCertificatePublicController {
  public constructor(
    private readonly mdocIssuerCaService: MdocIssuerCaService,
    @InjectLogger(IacaCertificatePublicController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({
    summary: 'Download a tenant IACA certificate (DER) by SHA-256 fingerprint — the DSC AIA caIssuers target',
  })
  @ApiOkResponse({ description: 'The DER-encoded IACA certificate (`application/pkix-cert`)' })
  @ApiNotFoundResponse({ description: 'No registered IACA has this fingerprint' })
  @Get(':fingerprint')
  @Header('Content-Type', PKIX_CERT_MIME_TYPE)
  public async get(@Param('fingerprint') fingerprint: string): Promise<StreamableFile> {
    const logger = this.logger.child('get', { fingerprint })
    logger.trace('>')

    const certificate = await this.mdocIssuerCaService.findRegisteredIacaCertificate(fingerprint)
    if (!certificate) throw new NotFoundException(`No registered IACA certificate with fingerprint ${fingerprint}`)

    logger.trace('<')
    // A returned Buffer would be JSON-serialised by Nest; a StreamableFile is sent as raw bytes.
    return new StreamableFile(Buffer.from(certificate), { type: PKIX_CERT_MIME_TYPE })
  }
}
