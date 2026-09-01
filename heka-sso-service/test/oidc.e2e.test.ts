import { createHash, randomBytes } from 'node:crypto'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { Server } from 'net'
import request from 'supertest'

import { OidcSigningKey } from '../src/core/database'
import { initializeMikroOrm, startTestApp } from './helpers'

// TODO: re-enable once CI provides a Postgres instance for e2e tests
describe.skip('E2E OIDC provider', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema

    await ormSchemaGenerator.refresh()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    if (nestApp) await nestApp.close()
    if (ormSchemaGenerator) await ormSchemaGenerator.clear()
    if (orm) await orm.close(true)
  })

  test('serves discovery at the app root', async () => {
    const response = await request(app)
      .get('/.well-known/openid-configuration')
      .set('Host', 'localhost:3005')
      .expect(200)

    expect(response.body.issuer).toBe('http://localhost:3005')
    expect(response.body.jwks_uri).toBe('http://localhost:3005/jwks')
    expect(response.body.authorization_endpoint).toBe('http://localhost:3005/authorize')
  })

  test('serves the persisted signing keys on /jwks (public parts only)', async () => {
    const response = await request(app).get('/jwks').expect(200)

    const persisted = await orm.em.fork().find(OidcSigningKey, { retiredAt: null })
    expect(persisted.length).toBeGreaterThanOrEqual(2)

    const publishedKids = response.body.keys.map((key: any) => key.kid).sort()
    expect(publishedKids).toEqual(persisted.map((key) => key.kid).sort())
    for (const key of response.body.keys) {
      expect(key.d).toBeUndefined()
    }
  })

  test('Nest routes coexist with the mounted provider', async () => {
    // Nest keeps /health (Terminus) …
    const health = await request(app).get('/health')
    expect([200, 503]).toContain(health.status)
    expect(health.body.details ?? health.body.error).toBeDefined()

    // … and the /api surface (Swagger UI)
    await request(app)
      .get('/api/docs')
      .expect((res) => expect([200, 301, 302]).toContain(res.status))

    // everything else belongs to the provider (its plain 404, not Nest's JSON shape)
    const unknown = await request(app).get('/definitely-not-a-route').expect(404)
    expect(unknown.text).not.toContain('statusCode')
  })

  test('provider parses its own request bodies (no Nest body parser in front)', async () => {
    const response = await request(app).post('/token').type('form').send({ grant_type: 'authorization_code' })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(response.body.error).toBeDefined()
  })

  describe('protocol policy (OP core PR 2) — clients from env/.env OIDC_CLIENTS', () => {
    const brokerClientId = 'keycloak-broker'
    const brokerSecret = 'dev-only-broker-secret-do-not-use-in-production'
    const brokerRedirectUri = 'http://localhost:8080/realms/master/broker/heka-sso/endpoint'

    const codeVerifier = randomBytes(32).toString('base64url')
    const validAuthorizeQuery = {
      client_id: brokerClientId,
      redirect_uri: brokerRedirectUri,
      response_type: 'code',
      scope: 'openid',
      state: 'state-value',
      nonce: 'nonce-value',
      code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
      code_challenge_method: 'S256',
    }

    test('discovery advertises code + PKCE S256 + secret-based client auth', async () => {
      const response = await request(app).get('/.well-known/openid-configuration').expect(200)

      expect(response.body.response_types_supported).toEqual(['code'])
      expect(response.body.code_challenge_methods_supported).toEqual(['S256'])
      expect(response.body.token_endpoint_auth_methods_supported.sort()).toEqual([
        'client_secret_basic',
        'client_secret_post',
      ])
    })

    test('/authorize rejects an unknown client on the error page', async () => {
      const response = await request(app)
        .get('/authorize')
        .query({ ...validAuthorizeQuery, client_id: 'unknown-client' })

      expect(response.status).toBe(400)
      expect(response.headers.location).toBeUndefined()
      expect(response.text).toContain('Sign-in error')
    })

    test('/authorize rejects an unregistered redirect_uri on the error page', async () => {
      const response = await request(app)
        .get('/authorize')
        .query({ ...validAuthorizeQuery, redirect_uri: 'https://attacker.example.com/callback' })

      expect(response.status).toBe(400)
      expect(response.headers.location).toBeUndefined()
    })

    test('/authorize accepts a missing PKCE challenge (requirement relaxed for Keycloak broker defaults)', async () => {
      // pkce.required was relaxed to `() => false` (commit e7ef715); revisit
      // once the demo realm (P1.7) pins PKCE S256 on the IdP side.
      const withoutPkce: Partial<typeof validAuthorizeQuery> = { ...validAuthorizeQuery }
      delete withoutPkce.code_challenge
      delete withoutPkce.code_challenge_method
      const response = await request(app).get('/authorize').query(withoutPkce).expect(303)

      expect(response.headers.location).toMatch(/\/interaction\/[^/]+$/)
    })

    test('/authorize routes a valid request toward the interaction', async () => {
      const response = await request(app).get('/authorize').query(validAuthorizeQuery).expect(303)

      expect(response.headers.location).toMatch(/\/interaction\/[^/]+$/)
    })

    test('/token enforces client authentication', async () => {
      const response = await request(app)
        .post('/token')
        .auth(brokerClientId, 'wrong-secret')
        .type('form')
        .send({ grant_type: 'authorization_code', code: 'bogus', redirect_uri: brokerRedirectUri })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('invalid_client')
    })

    test('/token rejects an unknown code for an authenticated client', async () => {
      const response = await request(app).post('/token').auth(brokerClientId, brokerSecret).type('form').send({
        grant_type: 'authorization_code',
        code: 'bogus',
        code_verifier: codeVerifier,
        redirect_uri: brokerRedirectUri,
      })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('invalid_grant')
    })
  })
})
