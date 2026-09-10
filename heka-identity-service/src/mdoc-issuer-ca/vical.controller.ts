import { Controller, Get, Header, NotFoundException } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { InjectLogger, Logger } from 'common/logger'

import { TrustListService } from './trust-list.service'

/**
 * Serves the Heka VICAL (ISO 18013-5 trust list). Tenant-less and **unauthenticated** — it carries
 * only public key material (per-tenant IACA certificates) signed by the VICAL signer, and wallets
 * fetch it before they have any session.
 *
 * Optional export for ISO 18013-5 readers that import VICALs (Multipaz and similar); **off by
 * default** (`VICAL_ENABLED`) — EUDI-shaped consumers use the scheme trust lists (`/trust-list/*`),
 * which publish the same IACA registry. While disabled the endpoint answers 404 and no VICAL signer
 * is ever provisioned.
 */
@ApiTags('mdoc Issuer CA')
@Controller('vical')
export class VicalController {
  public constructor(
    private readonly trustListService: TrustListService,
    @InjectLogger(VicalController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({
    summary: 'Get the Heka VICAL (ISO 18013-5 trust list — COSE_Sign1 CBOR). Optional; requires VICAL_ENABLED=true',
  })
  @ApiOkResponse({ description: 'The signed VICAL (application/cbor)' })
  @ApiNotFoundResponse({ description: 'VICAL publication is disabled (`VICAL_ENABLED` is not `true`)' })
  @Get()
  @Header('Content-Type', 'application/cbor')
  public async getVical(): Promise<Buffer> {
    const logger = this.logger.child('getVical')
    logger.trace('>')

    if (!this.trustListService.enabled) {
      logger.trace('< disabled')
      throw new NotFoundException('VICAL publication is disabled (VICAL_ENABLED is not true)')
    }

    const vical = await this.trustListService.getVical()

    logger.trace('<')
    return Buffer.from(vical)
  }
}
