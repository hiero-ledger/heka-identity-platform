import { Controller, Get, Header } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { InjectLogger, Logger } from 'common/logger'

import { EuTrustListService } from './eu-trust-list.service'

/**
 * Serves the Heka **EU trust list** — an **ETSI TS 119 602 LoTE JWT** over the unioned EU issuer
 * anchors (curated config / LoTL traversal / LoTE ingestion). Tenant-less and **unauthenticated** — it
 * carries only public key material (EU issuer-CA certificates) signed by the EU-list signer, and
 * wallets fetch it before any session (mirrors the VICAL endpoint).
 */
@ApiTags('mdoc Issuer CA')
@Controller('eu-trust-list')
export class EuTrustListController {
  public constructor(
    private readonly euTrustListService: EuTrustListService,
    @InjectLogger(EuTrustListController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get the Heka EU trust list (ETSI TS 119 602 LoTE JWT — compact JWS/ES256)' })
  @ApiOkResponse({ description: 'The signed EU trust list (application/jwt, typ trustlist+jwt)' })
  @Get()
  @Header('Content-Type', 'application/jwt')
  public async getTrustList(): Promise<string> {
    const logger = this.logger.child('getTrustList')
    logger.trace('>')

    const jws = await this.euTrustListService.getTrustList()

    logger.trace('<')
    return jws
  }
}
