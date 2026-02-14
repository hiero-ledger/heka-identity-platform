import { Controller, Get, Param } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { InjectLogger, Logger } from '../../common/logger'

import { GetCredentialStatusListResponse } from './dto'
import { StatusListService } from './status-list.service'

@ApiTags('Status List (public)')
@Controller('credentials/status')
export class StatusListPublicController {
  public constructor(
    private readonly statusListService: StatusListService,
    @InjectLogger(StatusListPublicController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Download status list' })
  @ApiOkResponse({ type: GetCredentialStatusListResponse })
  @Get(':id')
  public async get(@Param('id') id: string): Promise<GetCredentialStatusListResponse> {
    const logger = this.logger.child('download', { id })
    logger.trace('>')

    const res = await this.statusListService.getItemDetails(id)

    logger.trace({ res }, '<')
    return res
  }
}
