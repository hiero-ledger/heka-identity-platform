import { readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import { Controller, Get, Logger, Param, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Response } from 'express'

import { pageAssetsDir } from './pages'

/**
 * Shared static assets for the bridge pages (INTEGRATION.md P2.10.1): the
 * stylesheet + logo referenced by all four HTML documents, served from the
 * bridge's own origin at `/interaction/assets/*` (a Nest carve-out of the
 * provider root mount, like the interaction routes). Files come from
 * `pages/assets/` — edit or volume-mount them for per-deployment branding.
 *
 * Only whitelisted extensions from that single directory are served: the
 * `:file` parameter is one path segment by routing, and basename() plus the
 * name pattern reject traversal.
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
      res.sendStatus(404)
      return
    }

    try {
      const content = await readFile(join(pageAssetsDir, file))
      res.setHeader('cache-control', 'public, max-age=300')
      res.type(contentType).send(content)
    } catch {
      this.logger.warn(`asset '${file}' not found`)
      res.sendStatus(404)
    }
  }
}
