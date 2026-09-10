import { Controller, Get, Header, Param } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

import { InjectLogger, Logger } from 'common/logger'

import { SchemeTrustListIndexDto } from './dto/scheme-trust-list.dto'
import { SCHEME_LIST_IDS, SchemeTrustListService } from './scheme-trust-list.service'

/**
 * Serves the Heka **scheme trust lists** — ETSI TS 119 602 LoTE JWTs of the anchors Heka is scheme
 * operator for (`/trust-list/eaa-providers`: the tenants' and partners' issuer certificates;
 * `/trust-list/wrpac-providers`: the service root as access-certificate authority) plus a discovery
 * index. Tenant-less and **unauthenticated** — the lists carry only public key material signed by the
 * list signer, and wallets fetch them before any session (mirrors the VICAL endpoint).
 */
@ApiTags('Trust lists')
@Controller('trust-list')
export class SchemeTrustListController {
  public constructor(
    private readonly schemeTrustListService: SchemeTrustListService,
    @InjectLogger(SchemeTrustListController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Discovery index of the Heka scheme trust lists (+ pointers to external lists)' })
  @ApiOkResponse({ description: 'Index', type: SchemeTrustListIndexDto })
  @Get()
  public getIndex(): SchemeTrustListIndexDto {
    return this.schemeTrustListService.getIndex()
  }

  @ApiOperation({ summary: 'Get one Heka scheme trust list (ETSI TS 119 602 LoTE JWT — compact JWS/ES256)' })
  @ApiParam({ name: 'listId', enum: SCHEME_LIST_IDS, description: 'Which scheme list' })
  @ApiOkResponse({ description: 'The signed list (application/trustlist+jwt, typ trustlist+jwt)' })
  @ApiNotFoundResponse({ description: 'Unknown list id' })
  @Get(':listId')
  @Header('Content-Type', 'application/trustlist+jwt')
  public async getList(@Param('listId') listId: string): Promise<string> {
    const logger = this.logger.child('getList', { listId })
    logger.trace('>')

    const jws = await this.schemeTrustListService.getList(listId)

    logger.trace('<')
    return jws
  }
}
