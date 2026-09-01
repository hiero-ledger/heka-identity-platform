import { createHash, randomBytes } from 'node:crypto'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { Server } from 'net'
import request from 'supertest'

import { OidcEntity, OidcSigningKey } from '../src/core/database'
import { OidcCleanupService } from '../src/oidc'
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

  describe('full stub-login code flow over the MikroORM adapter (P1.3–P1.5)', () => {
    const brokerClientId = 'keycloak-broker'
    const brokerSecret = 'dev-only-broker-secret-do-not-use-in-production'
    const brokerRedirectUri = 'http://localhost:8080/realms/master/broker/heka-sso/endpoint'

    /** Minimal cookie jar: supertest does not persist cookies across requests. */
    const jarFactory = () => {
      const cookies = new Map<string, string>()
      return {
        store(response: request.Response) {
          for (const cookie of ([] as string[]).concat(response.headers['set-cookie'] ?? [])) {
            const pair = cookie.split(';')[0]
            const separator = pair.indexOf('=')
            if (pair.slice(separator + 1)) cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
            else cookies.delete(pair.slice(0, separator))
          }
        },
        header: () => [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
      }
    }

    const runAuthorizationFlow = async (codeVerifier: string) => {
      const jar = jarFactory()
      let response = await request(app)
        .get('/authorize')
        .query({
          client_id: brokerClientId,
          redirect_uri: brokerRedirectUri,
          response_type: 'code',
          scope: 'openid',
          state: 'e2e-state',
          nonce: 'e2e-nonce',
          code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
          code_challenge_method: 'S256',
        })
        .expect(303)
      jar.store(response)

      let location = response.headers.location
      for (let hop = 0; hop < 6 && !location.startsWith(brokerRedirectUri); hop++) {
        const { pathname, search } = new URL(location, 'http://localhost')
        response = await request(app).get(`${pathname}${search}`).set('Cookie', jar.header()).expect(303)
        jar.store(response)
        location = response.headers.location
      }
      expect(location).toMatch(new RegExp(`^${brokerRedirectUri}`))
      return new URL(location)
    }

    test('login → auto-consent → code exchange → userinfo, artifacts persisted in Postgres', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const callbackUrl = await runAuthorizationFlow(codeVerifier)
      const code = callbackUrl.searchParams.get('code')
      expect(code).toBeTruthy()

      const tokens = await request(app).post('/token').auth(brokerClientId, brokerSecret).type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: brokerRedirectUri,
      })
      expect(tokens.status).toBe(200)

      const idToken = JSON.parse(Buffer.from(tokens.body.id_token.split('.')[1], 'base64url').toString())
      expect(idToken.nonce).toBe('e2e-nonce')
      expect(idToken.amr).toEqual(['stub'])
      expect(idToken).toMatchObject({
        given_name: 'Stub',
        family_name: 'User',
        email: 'stub.user@example.com',
        login_config_id: 'default',
      })

      const userinfo = await request(app)
        .get('/userinfo')
        .set('Authorization', `Bearer ${tokens.body.access_token}`)
        .expect(200)
      expect(userinfo.body.sub).toBe(idToken.sub)

      // adapter persistence (P1.5): the flow's artifacts live in oidc_entity
      const em = orm.em.fork()
      for (const name of ['Session', 'Grant', 'AccessToken']) {
        expect(await em.count(OidcEntity, { name })).toBeGreaterThan(0)
      }
      // the consumed authorization code is marked, not resurrected
      const consumedCode = await em.findOne(OidcEntity, { name: 'AuthorizationCode', id: code as string })
      expect(consumedCode?.consumedAt).toBeTruthy()

      // single-use enforcement: replaying the code fails
      const replay = await request(app).post('/token').auth(brokerClientId, brokerSecret).type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: brokerRedirectUri,
      })
      expect(replay.status).toBe(400)
      expect(replay.body.error).toBe('invalid_grant')
    })

    test('cleanup task purges expired artifacts (P1.5)', async () => {
      const em = orm.em.fork()
      em.persist(
        new OidcEntity({
          name: 'AccessToken',
          id: 'expired-e2e-token',
          payload: { jti: 'expired-e2e-token' },
          expiresAt: new Date(Date.now() - 60_000),
        }),
      )
      await em.flush()

      const removed = await nestApp.get(OidcCleanupService).removeExpiredEntities()
      expect(removed).toBeGreaterThanOrEqual(1)
      expect(await em.fork().findOne(OidcEntity, { name: 'AccessToken', id: 'expired-e2e-token' })).toBeNull()
    })
  })
})
