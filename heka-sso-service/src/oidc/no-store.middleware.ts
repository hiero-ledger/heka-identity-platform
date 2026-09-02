import type { NextFunction, Request, Response } from 'express'

/**
 * `Cache-Control: no-store` for the interaction surface. Every `/interaction`
 * response is per-user and per-attempt — the login page embeds a single-use
 * authorization request (QR + deep link) and the interaction uid, and the
 * `status`/`complete` sub-routes are cookie-bound — so none of it may
 * land in a browser or proxy cache (Back button, shared machines, stale
 * `request_uri`). Scoped to `InteractionController` in `OidcModule` rather
 * than applied globally: discovery and JWKS are meant to be cached by relying
 * parties, and the provider sets `no-store` on its own sensitive endpoints.
 *
 * Plain express middleware (not a Nest class) so the unit suites, which mount
 * the controller on a bare express app, can wire it exactly as production does.
 */
export const noStoreMiddleware = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  next()
}
