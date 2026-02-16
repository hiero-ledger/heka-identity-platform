import type { Response } from 'express'

import { Readable } from 'stream'

import { Controller, Get, Inject, Res, StreamableFile, Param } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'

import { Agent, AGENT_TOKEN } from '../../common/agent'
import { InjectLogger, Logger } from '../../common/logger'

import { GetRevocationRegistryResponse } from './dto'
import { TailsService } from './tails.service'

@ApiTags('Tails')
@Controller('revocation/tails')
export class TailsController {
  public constructor(
    private readonly tailsService: TailsService,
    @InjectLogger(TailsController)
    private readonly logger: Logger,
    @Inject(AGENT_TOKEN)
    private readonly agent: Agent,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Get revocation tails file' })
  @ApiOkResponse({ type: GetRevocationRegistryResponse })
  @ApiQuery({ name: 'hash', type: String, required: true })
  @Get(':hash')
  public async download(@Param('hash') hash: string, @Res() res: Response): Promise<StreamableFile> {
    const logger = this.logger.child('getTailsFile', { hash })
    logger.trace('>')

    const tails = await this.tailsService.download(this.agent, hash)

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="tails"`,
      'Content-Length': tails.length,
    })

    const stream = new Readable()
    stream.push(tails)
    stream.push(null)
    stream.pipe(res)

    return new StreamableFile(stream)
  }
}
