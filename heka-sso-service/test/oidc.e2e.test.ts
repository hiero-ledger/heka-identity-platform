import { createHash, randomBytes } from 'node:crypto'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { Server } from 'net'
import request from 'supertest'

import { OidcEntity, OidcSigningKey } from '../src/core/database'
import { OidcCleanupService } from '../src/oidc'
import { initializeMikroOrm, startTestApp } from './helpers'

const brokerClientId = 'keycloak-broker'
const brokerSecret = 'e2e-broker-secret-value'
const brokerRedirectUri = 'http://localhost:8080/realms/heka/broker/heka-sso/endpoint'

/**
 * The e2e env is pinned here (P1.8) — independent of `env/.env` drift. The
 * login config mirrors the demo shape (mDL SD-JWT, §4.2): DCQL query id `mdl`,
 * claim mapping `mdl.<claim> → <oidc claim>`.
 */
const e2eEnv: Record<string, string> = {
  // MainModule.bootstrap listens on APP_PORT — keep clear of a running dev bridge (:3005)
  APP_PORT: '3105',
  OIDC_ISSUER_URL: 'http://localhost:3005',
  OIDC_COOKIE_KEYS: 'e2e-cookie-key-0123456789abcdef',
  OIDC_SUB_HMAC_SALT: 'e2e-sub-hmac-salt-0123456789abcdef01234567',
  OIDC_CLIENTS: JSON.stringify([
    {
      clientId: brokerClientId,
      clientSecret: brokerSecret,
      redirectUris: [brokerRedirectUri],
      loginConfigId: 'default',
    },
  ]),
  OIDC_LOGIN_CONFIGS: JSON.stringify([
    {
      id: 'default',
      verificationTemplate: 'default',
      dcqlQuery: {
        credentials: [
          {
            id: 'mdl',
            format: 'dc+sd-jwt',
            meta: { vct_values: ['mDL'] },
            claims: [{ path: ['given_name'] }, { path: ['family_name'] }, { path: ['email'] }],
          },
        ],
      },
      claimMapping: {
        'mdl.given_name': 'given_name',
        'mdl.family_name': 'family_name',
        'mdl.email': 'email',
      },
      subStrategy: 'derived',
      issuerAllowlist: [],
    },
  ]),
  // wiped/overridden per app below
  OIDC_STUB_LOGIN: 'false',
  IDENTITY_SERVICE_BASE_URL: 'http://identity.e2e.internal',
  IDENTITY_SERVICE_AUTH_TOKEN: '',
  IDENTITY_SERVICE_AUTH_NAME: '',
  IDENTITY_SERVICE_AUTH_PASSWORD: '',
  IDENTITY_SERVICE_PUBLIC_VERIFIER_ID: '',
  IDENTITY_SERVICE_REQUEST_SIGNER_DID: '',
}

const applyEnv = (overrides: Record<string, string> = {}) => {
  for (const [key, value] of Object.entries({ ...e2eEnv, ...overrides })) process.env[key] = value
}

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

type Jar = ReturnType<typeof jarFactory>

/** Follows the provider's 303 chain until it lands on the client redirect_uri. */
const follow303Chain = async (app: Server, jar: Jar, startLocation: string): Promise<URL> => {
  let location = startLocation
  for (let hop = 0; hop < 6 && !location.startsWith(brokerRedirectUri); hop++) {
    const { pathname, search } = new URL(location, 'http://localhost')
    const response = await request(app).get(`${pathname}${search}`).set('Cookie', jar.header()).expect(303)
    jar.store(response)
    location = response.headers.location
  }
  expect(location).toMatch(new RegExp(`^${brokerRedirectUri}`))
  return new URL(location)
}

const authorizeQuery = (codeVerifier: string) => ({
  client_id: brokerClientId,
  redirect_uri: brokerRedirectUri,
  response_type: 'code',
  scope: 'openid',
  state: 'e2e-state',
  nonce: 'e2e-nonce',
  code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
  code_challenge_method: 'S256',
})

const exchangeCode = (app: Server, code: string | null, codeVerifier: string) =>
  request(app).post('/token').auth(brokerClientId, brokerSecret).type('form').send({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: brokerRedirectUri,
  })

const decodeJwtPayload = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())

// Opt-in: needs the dev Postgres (docker-compose.dev.yml, port 5434).
// Run with `yarn test:e2e` (or E2E=true in the environment).
describe.skipIf(process.env.E2E !== 'true')('E2E OIDC provider', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
    await ormSchemaGenerator.refresh()
  })

  afterAll(async () => {
    if (ormSchemaGenerator) await ormSchemaGenerator.clear()
    if (orm) await orm.close(true)
  })

  describe('stub-login app (P1.3–P1.5)', () => {
    let nestApp: INestApplication
    let app: Server

    beforeAll(async () => {
      applyEnv({ OIDC_STUB_LOGIN: 'true' })
      nestApp = await startTestApp()
      app = nestApp.getHttpServer() as Server
    })

    afterAll(async () => {
      if (nestApp) await nestApp.close()
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

    describe('protocol policy (OP core PR 2)', () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const validAuthorizeQuery = authorizeQuery(codeVerifier)

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

      test('/authorize rejects a missing PKCE challenge — required for all clients (restored with the P1.7 demo realm)', async () => {
        const withoutPkce: Partial<typeof validAuthorizeQuery> = { ...validAuthorizeQuery }
        delete withoutPkce.code_challenge
        delete withoutPkce.code_challenge_method
        const response = await request(app).get('/authorize').query(withoutPkce).expect(303)

        const location = new URL(response.headers.location)
        expect(location.searchParams.get('error')).toBe('invalid_request')
        expect(location.searchParams.get('error_description')).toContain('PKCE')
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
        const response = await exchangeCode(app, 'bogus', codeVerifier)

        expect(response.status).toBe(400)
        expect(response.body.error).toBe('invalid_grant')
      })
    })

    describe('full stub-login code flow over the MikroORM adapter', () => {
      const runStubAuthorizationFlow = async (codeVerifier: string) => {
        const jar = jarFactory()
        const response = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
        jar.store(response)
        return await follow303Chain(app, jar, response.headers.location)
      }

      test('login → auto-consent → code exchange → userinfo, artifacts persisted in Postgres', async () => {
        const codeVerifier = randomBytes(32).toString('base64url')
        const callbackUrl = await runStubAuthorizationFlow(codeVerifier)
        const code = callbackUrl.searchParams.get('code')
        expect(code).toBeTruthy()

        const tokens = await exchangeCode(app, code, codeVerifier)
        expect(tokens.status).toBe(200)

        const idToken = decodeJwtPayload(tokens.body.id_token)
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
        const replay = await exchangeCode(app, code, codeVerifier)
        expect(replay.status).toBe(400)
        expect(replay.body.error).toBe('invalid_grant')
      })

      test('stable sub across logins (derived strategy)', async () => {
        const firstVerifier = randomBytes(32).toString('base64url')
        const first = await exchangeCode(
          app,
          (await runStubAuthorizationFlow(firstVerifier)).searchParams.get('code'),
          firstVerifier,
        )
        const secondVerifier = randomBytes(32).toString('base64url')
        const second = await exchangeCode(
          app,
          (await runStubAuthorizationFlow(secondVerifier)).searchParams.get('code'),
          secondVerifier,
        )

        expect(decodeJwtPayload(first.body.id_token).sub).toBe(decodeJwtPayload(second.body.id_token).sub)
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

  describe('wallet-login app with a mocked verification session (P1.6/P1.8)', () => {
    let nestApp: INestApplication
    let app: Server

    /** Mutable session state the mocked identity service reports (P1.6.3 polling). */
    let sessionState: 'RequestCreated' | 'ResponseVerified' | 'Error'
    const disclosedAttributes = { given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com' }

    const jsonResponse = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })

    const fetchMock = vi.fn(async (url: unknown) => {
      const target = String(url)
      if (target === 'http://identity.e2e.internal/openid4vc/verification-session/request') {
        return jsonResponse({
          verificationSession: { id: 'e2e-session' },
          authorizationRequest: 'openid4vp://?request_uri=https%3A%2F%2Fis%2Foid4vp%2Fe2e',
        })
      }
      if (target === 'http://identity.e2e.internal/openid4vc/verification-session/e2e-session') {
        return jsonResponse({
          id: 'e2e-session',
          state: sessionState,
          ...(sessionState === 'ResponseVerified' && { sharedAttributes: disclosedAttributes }),
        })
      }
      throw new Error(`unexpected fetch in e2e: ${target}`)
    })

    beforeAll(async () => {
      applyEnv({
        OIDC_STUB_LOGIN: 'false',
        IDENTITY_SERVICE_PUBLIC_VERIFIER_ID: 'did:key:zE2eVerifier',
        IDENTITY_SERVICE_REQUEST_SIGNER_DID: 'did:key:zE2eSigner',
        // static override (P1.6.7) — no auth-service login in the e2e
        IDENTITY_SERVICE_AUTH_TOKEN: 'e2e-static-token',
      })
      vi.stubGlobal('fetch', fetchMock)
      nestApp = await startTestApp()
      app = nestApp.getHttpServer() as Server
    })

    afterAll(async () => {
      if (nestApp) await nestApp.close()
      vi.unstubAllGlobals()
    })

    beforeEach(() => {
      sessionState = 'RequestCreated'
      fetchMock.mockClear()
    })

    test('full wallet flow: QR page → polling → cookie-bound completion → tokens with amr=[vc]', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const jar = jarFactory()

      // /authorize → interaction redirect, interaction cookie set
      const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
      jar.store(authorize)
      const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname

      // the login page renders (session created via the mocked identity service)
      const page = await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
      expect(page.text).toContain('Sign in with your wallet')
      expect(page.text).toContain(`${interactionPath}/status`)
      expect(fetchMock.mock.calls[0][0]).toBe('http://identity.e2e.internal/openid4vc/verification-session/request')

      // polling: pending while the wallet has not responded …
      const pending = await request(app).get(`${interactionPath}/status`).set('Cookie', jar.header()).expect(200)
      expect(pending.body.status).toBe('pending')

      // … verified once the (mocked) presentation is verified
      sessionState = 'ResponseVerified'
      const verified = await request(app).get(`${interactionPath}/status`).set('Cookie', jar.header()).expect(200)
      expect(verified.body.status).toBe('verified')

      // completion in the same cookie-bound session resumes the flow to the client
      const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
      jar.store(complete)
      const callbackUrl = await follow303Chain(app, jar, complete.headers.location)
      const code = callbackUrl.searchParams.get('code')
      expect(code).toBeTruthy()

      const tokens = await exchangeCode(app, code, codeVerifier)
      expect(tokens.status).toBe(200)

      const idToken = decodeJwtPayload(tokens.body.id_token)
      expect(idToken.amr).toEqual(['vc'])
      expect(idToken).toMatchObject({
        given_name: 'Ada',
        family_name: 'Lovelace',
        email: 'ada@example.com',
        login_config_id: 'default',
      })
      // the full disclosed set rides along (feasibility §3.5)
      expect(idToken.vc_presented_attributes).toEqual(disclosedAttributes)

      // userinfo sub consistency (§1 step 4)
      const userinfo = await request(app)
        .get('/userinfo')
        .set('Authorization', `Bearer ${tokens.body.access_token}`)
        .expect(200)
      expect(userinfo.body.sub).toBe(idToken.sub)
    })

    test('binding rule (§3.3): status and completion are rejected without the interaction cookie', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const jar = jarFactory()

      const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
      jar.store(authorize)
      const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname
      await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
      sessionState = 'ResponseVerified'

      // no cookie → no session state leaks, no code is released
      const uncookiedStatus = await request(app).get(`${interactionPath}/status`).expect(400)
      expect(uncookiedStatus.body.status).toBe('error')

      const uncookiedComplete = await request(app).get(`${interactionPath}/complete`)
      expect(uncookiedComplete.status).toBeGreaterThanOrEqual(400)
    })

    test('premature completion is refused while the presentation is unverified', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const jar = jarFactory()

      const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
      jar.store(authorize)
      const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname
      await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)

      // still RequestCreated — completing must fail, not log in
      const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
      const callbackUrl = await follow303Chain(app, jar, complete.headers.location)
      expect(callbackUrl.searchParams.get('error')).toBe('access_denied')
      expect(callbackUrl.searchParams.get('code')).toBeNull()
    })
  })
})
