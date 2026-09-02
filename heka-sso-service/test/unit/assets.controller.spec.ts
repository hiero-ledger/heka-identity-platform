import express from 'express'
import request from 'supertest'

import { InteractionAssetsController } from '../../src/oidc'

/**
 * Shared bridge-page assets (INTEGRATION.md P2.10.1): `/interaction/assets/*`
 * serves the stylesheet + logo from `pages/assets/` — whitelisted extensions
 * only, no traversal, no template exposure.
 */
describe('interaction assets (P2.10.1)', () => {
  const controller = new InteractionAssetsController()
  const app = express()
  app.get('/interaction/assets/:file', (req, res, next) => {
    controller.file(req.params.file, res).catch(next)
  })

  test('serves the built stylesheet and the hand-authored logo with correct content types and caching', async () => {
    // built by `yarn ui:build` (P2.10.2) — resolved from the pages/ui root
    const css = await request(app).get('/interaction/assets/styles.css').expect(200)
    expect(css.headers['content-type']).toContain('text/css')
    expect(css.headers['cache-control']).toContain('max-age')
    expect(css.text).toContain('--brand-primary')

    // resolved from the hand-authored pages/assets root
    const svg = await request(app).get('/interaction/assets/logo.svg').expect(200)
    expect(svg.headers['content-type']).toContain('image/svg+xml')
  })

  test('serves the built login-page script with the page behavior in it (P2.10.2)', async () => {
    const js = await request(app).get('/interaction/assets/login.js').expect(200)
    expect(js.headers['content-type']).toContain('text/javascript')
    expect(js.text).toContain('navigator.credentials') // DC API feature detection
    expect(js.text).toContain('/dc-api/start') // same-device path
    expect(js.text).toContain('/branding') // P2.10.3 branding fetch
    expect(js.text).toContain('/events') // P3.7 WebSocket push subscription (polling fallback retained)
    expect(js.text).toContain('/status') // P1.6.3 polling fallback
  })

  test('rejects traversal, non-whitelisted extensions, and missing files', async () => {
    await request(app).get('/interaction/assets/..%2Fpages.ts').expect(404) // decoded '../pages.ts'
    await request(app).get('/interaction/assets/secrets.txt').expect(404) // extension not whitelisted
    await request(app).get('/interaction/assets/login.html').expect(404) // templates are not assets
    await request(app).get('/interaction/assets/missing.css').expect(404) // whitelisted ext, absent file
  })
})
