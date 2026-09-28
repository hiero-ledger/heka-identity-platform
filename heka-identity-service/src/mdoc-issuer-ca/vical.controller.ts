import { Controller, Get, Header, NotFoundException, StreamableFile } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { InjectLogger, Logger } from 'common/logger'

import { TrustListService } from './trust-list.service'

/**
 * Serves the Heka VICAL (ISO 18013-5 trust list). Tenant-less and **unauthenticated** — it carries
 * only public key material (per-tenant IACA certificates) signed by the VICAL signer, and wallets
 * fetch it before they have any session.
 *
 * Off by default (`VICAL_ENABLED`, see `TrustListService`): answers 404 while disabled.
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
  public async getVical(): Promise<StreamableFile> {
    const logger = this.logger.child('getVical')
    logger.trace('>')

    if (!this.trustListService.enabled) {
      logger.trace('< disabled')
      throw new NotFoundException('VICAL publication is disabled (VICAL_ENABLED is not true)')
    }

    const vical = await this.trustListService.getVical()

    logger.trace('<')
    // A returned Buffer would be JSON-serialised by Nest; a StreamableFile is sent as raw bytes.
    return new StreamableFile(Buffer.from(vical), { type: 'application/cbor' })
  }
}
