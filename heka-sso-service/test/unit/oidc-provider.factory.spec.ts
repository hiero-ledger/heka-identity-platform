import request from 'supertest'

import { OidcConfig } from '../../src/core/config'
import { createOidcProvider } from '../../src/oidc'
import { testJwks } from '../helpers/jwks'

describe('createOidcProvider', () => {
  const issuer = 'http://localhost:3005'
  const jwks = testJwks()
  const provider = createOidcProvider(new OidcConfig({}), jwks)
  const callback = provider.callback()

  test('trusts the reverse proxy', () => {
    expect(provider.proxy).toBe(true)
  })

  test('serves discovery at the root with the configured issuer and routes', async () => {
    // Endpoint URLs are built from the request Host (forwarded by the reverse
    // proxy in production — provider.proxy = true); the issuer is from config.
    const response = await request(callback).get('/.well-known/openid-configuration').set('Host', 'localhost:3005').expect(200)

    expect(response.body.issuer).toBe(issuer)
    expect(response.body.authorization_endpoint).toBe(`${issuer}/authorize`)
    expect(response.body.token_endpoint).toBe(`${issuer}/token`)
    expect(response.body.jwks_uri).toBe(`${issuer}/jwks`)
    expect(response.body.userinfo_endpoint).toBe(`${issuer}/userinfo`)
  })

  test('publishes only the public halves of the signing keys with kid and alg', async () => {
    const response = await request(callback).get('/jwks').expect(200)

    const keys: Record<string, any>[] = response.body.keys
    expect(keys.map((key) => key.alg).sort()).toEqual(['ES256', 'RS256'])
    expect(keys.map((key) => key.kid).sort()).toEqual(jwks.keys.map((key) => key.kid).sort())
    for (const key of keys) {
      expect(key.use).toBe('sig')
      // Private material must never be published
      expect(key.d).toBeUndefined()
      expect(key.p).toBeUndefined()
      expect(key.q).toBeUndefined()
    }
  })

  test('renders the custom error page for an invalid authorization request', async () => {
    const response = await request(callback).get('/authorize')

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.text).toContain('Sign-in error')
    expect(response.text).not.toContain('at Object.') // no stack traces
  })

  test('answers unknown routes itself (the provider owns the app root)', async () => {
    const response = await request(callback).get('/definitely-not-a-route')

    expect(response.status).toBe(404)
    // The provider's plain 404, not Nest's JSON NotFoundException shape
    expect(response.text).not.toContain('statusCode')
  })
})
