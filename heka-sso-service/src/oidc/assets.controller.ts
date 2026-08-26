import { readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import { Controller, Get, Logger, Param, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Response } from 'express'

import { pageAssetRoots } from './pages'

/**
 * Shared static assets for the bridge pages (INTEGRATION.md P2.10.1/P2.10.2):
 * the built login-page bundle (`login.js`, `styles.css` — Vite output, which
 * the three hook templates also link) and the hand-authored `logo.svg`,
 * served from the bridge's own origin at `/interaction/assets/*` (a Nest
 * carve-out of the provider root mount, like the interaction routes). Files
 * resolve against `pageAssetRoots` in order — edit sources and `yarn
 * ui:build`, or volume-mount over `dist/oidc/pages` for per-deployment
 * branding.
 *
 * Only whitelisted extensions from those directories are served: the `:file`
 * parameter is one path segment by routing, and basename() plus the name
 * pattern reject traversal (this also keeps `ui/login.html` unexposed here).
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
    res.sendStatus(404)
  }
}
