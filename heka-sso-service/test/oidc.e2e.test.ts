import { createHash, randomBytes } from 'node:crypto'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { Server } from 'net'
import request from 'supertest'
import WebSocket from 'ws'

import { OidcEntity, OidcSigningKey } from '../src/core/database'
import { LoginEventsService, OidcCleanupService, VerificationSessionState } from '../src/oidc'
import { initializeMikroOrm, startTestApp } from './helpers'

const brokerClientId = 'keycloak-broker'
const brokerSecret = 'e2e-broker-secret-value'
const brokerRedirectUri = 'http://localhost:8080/realms/heka/broker/heka-sso/endpoint'

// A second, independent client for the isolation checks:
// codes and subs must never cross the client boundary.
const secondClientId = 'second-broker'
const secondClientSecret = 'e2e-second-broker-secret'
const secondRedirectUri = 'http://localhost:8081/realms/other/broker/heka-sso/endpoint'

/**
 * The e2e env is pinned here — independent of `env/.env` drift. The
 * login config mirrors the demo shape (mDL SD-JWT): DCQL query id `mdl`,
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
      postLogoutRedirectUris: [`${brokerRedirectUri}/logout_response`],
      // makes the provider mint `sid`; unreachable on purpose — a failed
      // back-channel POST must never break the RP-initiated logout itself
      backchannelLogoutUri: 'http://localhost:9/backchannel-logout',
      loginConfigId: 'default',
    },
    {
      clientId: secondClientId,
      clientSecret: secondClientSecret,
      redirectUris: [secondRedirectUri],
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
      // per-client login-page branding
      branding: { productName: 'E2E Corp ID', colors: { 'brand-primary': '#0a5c36' } },
    },
  ]),
  // pinned to the default — a dev env/.env may enable it
  OIDC_LOGOUT_AUTO_CONFIRM: 'false',
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
const follow303Chain = async (
  app: Server,
  jar: Jar,
  startLocation: string,
  redirectUri: string = brokerRedirectUri,
): Promise<URL> => {
  let location = startLocation
  for (let hop = 0; hop < 6 && !location.startsWith(redirectUri); hop++) {
    const { pathname, search } = new URL(location, 'http://localhost')
    const response = await request(app).get(`${pathname}${search}`).set('Cookie', jar.header()).expect(303)
    jar.store(response)
    location = response.headers.location
  }
  expect(location).toMatch(new RegExp(`^${redirectUri}`))
  return new URL(location)
}

const authorizeQuery = (codeVerifier: string, overrides: Record<string, string> = {}) => ({
  client_id: brokerClientId,
  redirect_uri: brokerRedirectUri,
  response_type: 'code',
  scope: 'openid',
  state: 'e2e-state',
  nonce: 'e2e-nonce',
  code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
  code_challenge_method: 'S256',
  ...overrides,
})

interface TokenClient {
  id: string
  secret: string
  redirectUri: string
}

const brokerTokenClient: TokenClient = { id: brokerClientId, secret: brokerSecret, redirectUri: brokerRedirectUri }

const exchangeCode = (
  app: Server,
  code: string | null,
  codeVerifier: string,
  client: TokenClient = brokerTokenClient,
) =>
  request(app).post('/token').auth(client.id, client.secret).type('form').send({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: client.redirectUri,
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

  describe('stub-login app', () => {
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

      test('/authorize rejects a missing PKCE challenge — required for all clients (restored with the demo realm)', async () => {
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

        // adapter persistence: the flow's artifacts live in oidc_entity
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

      test('RP-initiated logout: confirmation dialog → session ended → redirect to the broker logout return', async () => {
        // sign in, keeping the session cookies
        const codeVerifier = randomBytes(32).toString('base64url')
        const jar = jarFactory()
        const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
        jar.store(authorize)
        const callbackUrl = await follow303Chain(app, jar, authorize.headers.location)
        const tokens = await exchangeCode(app, callbackUrl.searchParams.get('code'), codeVerifier)
        const idToken = tokens.body.id_token as string
        expect(decodeJwtPayload(idToken).sid).toEqual(expect.any(String)) // sid-matched logout reference

        // default behavior: the confirmation dialog is shown (auto-confirm is opt-in via OIDC_LOGOUT_AUTO_CONFIRM)
        const confirmPage = await request(app)
          .get('/session/end')
          .query({
            id_token_hint: idToken,
            post_logout_redirect_uri: `${brokerRedirectUri}/logout_response`,
            state: 'kc-logout-state',
          })
          .set('Cookie', jar.header())
          .expect(200)
        expect(confirmPage.text).toContain('Do you want to sign out')
        jar.store(confirmPage)

        const xsrf = /name="xsrf" value="([^"]+)"/.exec(confirmPage.text)![1]
        const confirmed = await request(app)
          .post('/session/end/confirm')
          .type('form')
          .set('Cookie', jar.header())
          .send({ xsrf, logout: 'yes' })
          .expect(303)
        jar.store(confirmed)
        const redirect = new URL(confirmed.headers.location)
        expect(`${redirect.origin}${redirect.pathname}`).toBe(`${brokerRedirectUri}/logout_response`)
        expect(redirect.searchParams.get('state')).toBe('kc-logout-state')

        // the session is really gone — silent re-auth must fail
        const silentVerifier = randomBytes(32).toString('base64url')
        const silent = await request(app)
          .get('/authorize')
          .query({ ...authorizeQuery(silentVerifier), prompt: 'none' })
          .set('Cookie', jar.header())
          .expect(303)
        expect(new URL(silent.headers.location).searchParams.get('error')).toBe('login_required')
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

      test('cleanup task purges expired artifacts', async () => {
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

    /**
     * threat-model-driven coverage: the OAuth/OIDC
     * seam of interID's checklist, exercised against the running
     * provider. The wallet/verification seam is covered in the
     * wallet-login app suite below.
     */
    describe('threat-model coverage (interID, OAuth/OIDC seam)', () => {
      const runFlow = async (codeVerifier: string, overrides: Record<string, string> = {}, redirectUri?: string) => {
        const jar = jarFactory()
        const response = await request(app).get('/authorize').query(authorizeQuery(codeVerifier, overrides)).expect(303)
        jar.store(response)
        return { jar, callbackUrl: await follow303Chain(app, jar, response.headers.location, redirectUri) }
      }

      test('/token rejects a wrong PKCE code_verifier', async () => {
        const codeVerifier = randomBytes(32).toString('base64url')
        const { callbackUrl } = await runFlow(codeVerifier)

        const response = await exchangeCode(
          app,
          callbackUrl.searchParams.get('code'),
          randomBytes(32).toString('base64url'),
        )
        expect(response.status).toBe(400)
        expect(response.body.error).toBe('invalid_grant')
      })

      test('/token rejects a redirect_uri differing from the authorization request', async () => {
        const codeVerifier = randomBytes(32).toString('base64url')
        const { callbackUrl } = await runFlow(codeVerifier)

        const response = await exchangeCode(app, callbackUrl.searchParams.get('code'), codeVerifier, {
          ...brokerTokenClient,
          redirectUri: `${brokerRedirectUri}/other`,
        })
        expect(response.status).toBe(400)
        expect(response.body.error).toBe('invalid_grant')
      })

      test('a code issued to one client cannot be redeemed by another (validly authenticated) client', async () => {
        const codeVerifier = randomBytes(32).toString('base64url')
        const { callbackUrl } = await runFlow(codeVerifier)

        const response = await exchangeCode(app, callbackUrl.searchParams.get('code'), codeVerifier, {
          id: secondClientId,
          secret: secondClientSecret,
          redirectUri: brokerRedirectUri,
        })
        expect(response.status).toBe(400)
        expect(response.body.error).toBe('invalid_grant')
      })

      test('state is echoed verbatim on success and error redirects (no length limit — broker matrix)', async () => {
        const longState = randomBytes(96).toString('base64url') // 128 chars

        const codeVerifier = randomBytes(32).toString('base64url')
        const { callbackUrl } = await runFlow(codeVerifier, { state: longState })
        expect(callbackUrl.searchParams.get('state')).toBe(longState)

        // error redirect (missing PKCE) carries the same state back
        const withoutPkce: Partial<ReturnType<typeof authorizeQuery>> = authorizeQuery('unused', { state: longState })
        delete withoutPkce.code_challenge
        delete withoutPkce.code_challenge_method
        const rejected = await request(app).get('/authorize').query(withoutPkce).expect(303)
        const errorRedirect = new URL(rejected.headers.location)
        expect(errorRedirect.searchParams.get('error')).toBe('invalid_request')
        expect(errorRedirect.searchParams.get('state')).toBe(longState)
      })

      test('the id_token is bound to its issuer, audience, and nonce', async () => {
        const codeVerifier = randomBytes(32).toString('base64url')
        const { callbackUrl } = await runFlow(codeVerifier)
        const tokens = await exchangeCode(app, callbackUrl.searchParams.get('code'), codeVerifier)
        expect(tokens.status).toBe(200)

        const idToken = decodeJwtPayload(tokens.body.id_token)
        expect(idToken.iss).toBe('http://localhost:3005')
        expect(idToken.aud).toBe(brokerClientId)
        expect(idToken.nonce).toBe('e2e-nonce')
      })

      test('provider cookies are HttpOnly; the interaction cookie is SameSite and path-scoped', async () => {
        const codeVerifier = randomBytes(32).toString('base64url')
        const response = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)

        const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? [])
        expect(cookies.length).toBeGreaterThan(0)
        for (const cookie of cookies) {
          expect(cookie).toMatch(/httponly/i)
        }
        const interactionCookie = cookies.find((cookie) => cookie.startsWith('_interaction='))
        expect(interactionCookie).toBeDefined()
        expect(interactionCookie).toMatch(/samesite=lax/i)
        expect(interactionCookie).toMatch(/path=\/interaction\//i)
      })

      test('the derived sub is pairwise — different clients see different subs for the same identity', async () => {
        const firstVerifier = randomBytes(32).toString('base64url')
        const first = await exchangeCode(
          app,
          (await runFlow(firstVerifier)).callbackUrl.searchParams.get('code'),
          firstVerifier,
        )

        const secondVerifier = randomBytes(32).toString('base64url')
        const secondFlow = await runFlow(
          secondVerifier,
          { client_id: secondClientId, redirect_uri: secondRedirectUri },
          secondRedirectUri,
        )
        const second = await exchangeCode(app, secondFlow.callbackUrl.searchParams.get('code'), secondVerifier, {
          id: secondClientId,
          secret: secondClientSecret,
          redirectUri: secondRedirectUri,
        })

        const firstSub = decodeJwtPayload(first.body.id_token).sub
        const secondSub = decodeJwtPayload(second.body.id_token).sub
        expect(firstSub).toBeTruthy()
        expect(secondSub).toBeTruthy()
        expect(firstSub).not.toBe(secondSub)
      })

      test('the logout confirmation rejects a wrong XSRF token and keeps the session', async () => {
        const codeVerifier = randomBytes(32).toString('base64url')
        const { jar, callbackUrl } = await runFlow(codeVerifier)
        const tokens = await exchangeCode(app, callbackUrl.searchParams.get('code'), codeVerifier)
        const idToken = tokens.body.id_token as string

        const confirmPage = await request(app)
          .get('/session/end')
          .query({ id_token_hint: idToken, post_logout_redirect_uri: `${brokerRedirectUri}/logout_response` })
          .set('Cookie', jar.header())
          .expect(200)
        jar.store(confirmPage)

        const forged = await request(app)
          .post('/session/end/confirm')
          .type('form')
          .set('Cookie', jar.header())
          .send({ xsrf: 'forged-xsrf-value', logout: 'yes' })
        expect(forged.status).toBeGreaterThanOrEqual(400)

        // the session survived the forged confirmation — silent re-auth still works
        const silentVerifier = randomBytes(32).toString('base64url')
        const silent = await request(app)
          .get('/authorize')
          .query({ ...authorizeQuery(silentVerifier), prompt: 'none' })
          .set('Cookie', jar.header())
          .expect(303)
        expect(new URL(silent.headers.location).searchParams.get('error')).toBeNull()
      })
    })
  })

  describe('wallet-login app with a mocked verification session', () => {
    let nestApp: INestApplication
    let app: Server

    /** Mutable session states the mocked identity service reports (direct_post polling + dc_api verify). */
    let sessionState: 'RequestCreated' | 'ResponseVerified' | 'Error'
    let dcSessionState: 'RequestCreated' | 'ResponseVerified' | 'Error'
    const disclosedAttributes = { given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com' }

    const jsonResponse = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })

    const fetchMock = vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
      const target = String(url)
      if (target === 'http://identity.e2e.internal/openid4vc/verification-session/request') {
        const body = JSON.parse(init?.body ?? '{}')
        if (body.responseMode === 'dc_api') {
          return jsonResponse({
            verificationSession: { id: 'e2e-dc-session' },
            authorizationRequest: 'openid4vp://…',
            authorizationRequestObject: { request: 'signed-jar-jwt' },
          })
        }
        return jsonResponse({
          verificationSession: { id: 'e2e-session' },
          authorizationRequest: 'openid4vp://?request_uri=https%3A%2F%2Fis%2Foid4vp%2Fe2e',
        })
      }
      if (target === 'http://identity.e2e.internal/openid4vc/verification-session/e2e-dc-session/verify') {
        dcSessionState = 'ResponseVerified'
        return jsonResponse({ id: 'e2e-dc-session', state: dcSessionState, sharedAttributes: disclosedAttributes })
      }
      if (target === 'http://identity.e2e.internal/openid4vc/verification-session/e2e-session') {
        return jsonResponse({
          id: 'e2e-session',
          state: sessionState,
          ...(sessionState === 'ResponseVerified' && { sharedAttributes: disclosedAttributes }),
        })
      }
      if (target === 'http://identity.e2e.internal/openid4vc/verification-session/e2e-dc-session') {
        return jsonResponse({
          id: 'e2e-dc-session',
          state: dcSessionState,
          ...(dcSessionState === 'ResponseVerified' && { sharedAttributes: disclosedAttributes }),
        })
      }
      throw new Error(`unexpected fetch in e2e: ${target}`)
    })

    beforeAll(async () => {
      applyEnv({
        OIDC_STUB_LOGIN: 'false',
        IDENTITY_SERVICE_PUBLIC_VERIFIER_ID: 'did:key:zE2eVerifier',
        IDENTITY_SERVICE_REQUEST_SIGNER_DID: 'did:key:zE2eSigner',
        // static override — no auth-service login in the e2e
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
      dcSessionState = 'RequestCreated'
      fetchMock.mockClear()
    })

    test('full wallet flow: static page → data (QR) → polling → cookie-bound completion → tokens with amr=[vc]', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const jar = jarFactory()

      // /authorize → interaction redirect, interaction cookie set
      const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
      jar.store(authorize)
      const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname

      // the static login page renders — no verification session yet
      const page = await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
      expect(page.text).toContain('Sign in with your wallet')
      expect(fetchMock).not.toHaveBeenCalled()

      // the QR data call creates the direct_post session via the mocked identity service
      const data = await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)
      expect(data.body.qrDataUrl).toContain('data:image/png;base64')
      expect(data.body.authorizationRequest).toContain('openid4vp://?request_uri=')
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
      // the full disclosed set rides along
      expect(idToken.vc_presented_attributes).toEqual(disclosedAttributes)

      // userinfo sub consistency
      const userinfo = await request(app)
        .get('/userinfo')
        .set('Authorization', `Bearer ${tokens.body.access_token}`)
        .expect(200)
      expect(userinfo.body.sub).toBe(idToken.sub)
    })

    test('DC API same-device flow: start → verify → cookie-bound completion → tokens with amr=[vc]', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const jar = jarFactory()

      const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
      jar.store(authorize)
      const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname
      await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)

      // start: dc_api session created, request object + protocol returned for navigator.credentials.get()
      const start = await request(app).post(`${interactionPath}/dc-api/start`).set('Cookie', jar.header()).expect(200)
      expect(start.body).toEqual({ protocol: 'openid4vp-v1-signed', request: { request: 'signed-jar-jwt' } })
      const createBody = JSON.parse(fetchMock.mock.calls[0][1]?.body ?? '{}')
      expect(createBody.responseMode).toBe('dc_api')
      // origin binding: the bridge's own origin (from OIDC_ISSUER_URL) rides in expectedOrigins
      expect(createBody.expectedOrigins).toEqual(['http://localhost:3005'])

      // verify: the browser-forwarded wallet response reaches the origin-bound verify endpoint
      const verify = await request(app)
        .post(`${interactionPath}/dc-api/verify`)
        .set('Cookie', jar.header())
        .send({ authorizationResponse: { vp_token: { pid: ['e2e-vp-token'] } } })
        .expect(200)
      expect(verify.body).toEqual({ status: 'verified' })
      const verifyCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/e2e-dc-session/verify'))
      expect(JSON.parse(verifyCall?.[1]?.body ?? '{}')).toEqual({
        authorizationResponse: { vp_token: { pid: ['e2e-vp-token'] } },
        origin: 'http://localhost:3005',
      })

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
      expect(idToken).toMatchObject({ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com' })
    })

    test('WebSocket push: cookie-bound subscription receives the verified push', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const jar = jarFactory()

      const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
      jar.store(authorize)
      const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname
      await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
      await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)

      // subscribe like the login page does — same-origin WebSocket carrying the interaction cookie
      const socket = new WebSocket(`ws://127.0.0.1:3105${interactionPath}/events`, {
        headers: { cookie: jar.header() },
      })
      await new Promise<void>((resolve, reject) => {
        socket.on('open', () => resolve())
        socket.on('error', reject)
        socket.on('unexpected-response', (_req, res) => reject(new Error(`upgrade refused: ${res.statusCode}`)))
      })
      const push = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('no push received')), 2000)
        socket.on('message', (data) => {
          clearTimeout(timeout)
          resolve(JSON.parse(String(data)))
        })
      })

      // the identity-service gateway is mocked out in e2e — inject its event at the relay
      sessionState = 'ResponseVerified'
      nestApp.get(LoginEventsService).handleSessionEvent({
        sessionId: 'e2e-session',
        state: VerificationSessionState.ResponseVerified,
      })
      expect(await push).toEqual({ status: 'verified' })
      socket.close()

      // an uncookied subscription is refused, no session state leaks
      const rejected = new WebSocket(`ws://127.0.0.1:3105${interactionPath}/events`)
      const refusal = await new Promise<string>((resolve) => {
        rejected.on('unexpected-response', (_req, res) => resolve(`status ${res.statusCode}`))
        rejected.on('error', (error) => resolve(String(error)))
      })
      expect(refusal).toMatch(/400|hang up|socket/i)
    })

    test('binding rule: the interaction API is rejected without the interaction cookie', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const jar = jarFactory()

      const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
      jar.store(authorize)
      const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname
      await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
      await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)
      sessionState = 'ResponseVerified'

      // no cookie → no session state leaks, no session is created or verified, no code is released
      const uncookiedStatus = await request(app).get(`${interactionPath}/status`).expect(400)
      expect(uncookiedStatus.body.status).toBe('error')

      const uncookiedData = await request(app).get(`${interactionPath}/data`).expect(400)
      expect(uncookiedData.body.status).toBe('error')

      const uncookiedStart = await request(app).post(`${interactionPath}/dc-api/start`).expect(400)
      expect(uncookiedStart.body.status).toBe('error')

      const uncookiedVerify = await request(app)
        .post(`${interactionPath}/dc-api/verify`)
        .send({ authorizationResponse: {} })
        .expect(400)
      expect(uncookiedVerify.body.status).toBe('error')

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
      await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)

      // still RequestCreated — completing must fail, not log in
      const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
      const callbackUrl = await follow303Chain(app, jar, complete.headers.location)
      expect(callbackUrl.searchParams.get('error')).toBe('access_denied')
      expect(callbackUrl.searchParams.get('code')).toBeNull()
    })

    test('bridge-page branding: shared assets served, per-client branding cookie-bound', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const jar = jarFactory()

      const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
      jar.store(authorize)
      const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname

      // the login page links the shared stylesheet
      const page = await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
      expect(page.text).toContain('/interaction/assets/styles.css')

      // … which the bridge serves from its own origin
      const css = await request(app).get('/interaction/assets/styles.css').expect(200)
      expect(css.headers['content-type']).toContain('text/css')
      expect(css.text).toContain('--brand-primary')

      // per-client branding, cookie-bound like every interaction route
      const branding = await request(app).get(`${interactionPath}/branding`).set('Cookie', jar.header()).expect(200)
      expect(branding.body).toEqual({ productName: 'E2E Corp ID', colors: { 'brand-primary': '#0a5c36' } })
      await request(app).get(`${interactionPath}/branding`).expect(400)
    })

    /** the proof request is built server-side from the login config; the browser supplies nothing. */
    test('the DCQL query sent to the identity service comes from the server-side login config only', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const jar = jarFactory()

      const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
      jar.store(authorize)
      const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname
      await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
      await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)

      const createBody = JSON.parse(fetchMock.mock.calls[0][1]?.body ?? '{}')
      const configuredLoginConfig = JSON.parse(e2eEnv.OIDC_LOGIN_CONFIGS)[0]
      expect(createBody.dcql).toEqual({ query: configuredLoginConfig.dcqlQuery })
      expect(createBody.responseMode).toBe('direct_post')
      // signed JAR: the wallet can verify who is asking
      expect(createBody.requestSigner).toEqual({ method: 'did', did: 'did:key:zE2eSigner' })
    })

    /** a finished interaction is consumed; replaying its completion route yields no second code. */
    test('a completed interaction cannot be replayed for a second authorization code', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const jar = jarFactory()

      const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
      jar.store(authorize)
      const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname
      await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
      await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)
      sessionState = 'ResponseVerified'

      const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
      jar.store(complete)
      const callbackUrl = await follow303Chain(app, jar, complete.headers.location)
      const tokens = await exchangeCode(app, callbackUrl.searchParams.get('code'), codeVerifier)
      expect(tokens.status).toBe(200)

      // the interaction was consumed with the resume — replaying /complete must not release anything
      const replay = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header())
      expect(replay.status).toBeGreaterThanOrEqual(400)
      expect(replay.headers.location ?? '').not.toContain('code=')
    })
  })
})
