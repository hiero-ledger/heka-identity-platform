import { readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import { NOT_FOUND } from '@const'
import { Controller, Get, Logger, Param, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Response } from 'express'

import { pageAssetRoots } from './pages'

/**
 * Shared static assets for the bridge pages
 */
@ApiExcludeController()
@Controller('interaction/assets')
export class InteractionAssetsController {
  private static readonly contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  }

  private readonly logger = new Logger(InteractionAssetsController.name)

  @Get(':file')
  public async file(@Param('file') file: string, @Res() res: Response): Promise<void> {
    const contentType = InteractionAssetsController.contentTypes[extname(file).toLowerCase()]
    if (!contentType || basename(file) !== file || !/^[\w.-]+$/.test(file) || file.includes('..')) {
      res.sendStatus(NOT_FOUND)
      return
    }

    for (const root of pageAssetRoots) {
      try {
        const content = await readFile(join(root, file))
        res.setHeader('cache-control', 'public, max-age=300')
        res.type(contentType).send(content)
        return
      } catch {
        // not in this root — try the next
      }
    }
    this.logger.warn(`asset '${file}' not found`)
    res.sendStatus(NOT_FOUND)
  }
}
