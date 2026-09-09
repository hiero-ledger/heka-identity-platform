import { Controller, Get, Header } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { InjectLogger, Logger } from 'common/logger'

import { TrustListService } from './trust-list.service'

/**
 * Serves the Heka VICAL (ISO 18013-5 trust list). Tenant-less and **unauthenticated** — it carries
 * only public key material (per-tenant IACA certificates) signed by the VICAL signer, and wallets
 * fetch it before they have any session.
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

  @ApiOperation({ summary: 'Get the Heka VICAL (ISO 18013-5 trust list — COSE_Sign1 CBOR)' })
  @ApiOkResponse({ description: 'The signed VICAL (application/cbor)' })
  @Get()
  @Header('Content-Type', 'application/cbor')
  public async getVical(): Promise<Buffer> {
    const logger = this.logger.child('getVical')
    logger.trace('>')

    const vical = await this.trustListService.getVical()

    logger.trace('<')
    return Buffer.from(vical)
  }
}
