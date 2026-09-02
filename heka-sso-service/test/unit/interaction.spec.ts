import { createHash, randomBytes } from 'node:crypto'

import express from 'express'
import request from 'supertest'

import { securityHeaders } from '../../src/common/middleware'
import { ConfigService, OidcConfig } from '../../src/core/config'
import {
  AccountClaimsStore,
  createOidcProvider,
  IdentityAcquirer,
  InteractionController,
  noStoreMiddleware,
  StubIdentityAcquirer,
} from '../../src/oidc'
import { testJwks } from '../helpers/jwks'

const brokerRedirectUri = 'https://kc.example.com/realms/r/broker/heka-sso/endpoint'
const brokerSecret = 'broker-secret-value-long-enough'
const subHmacSalt = 'unit-test-sub-hmac-salt-0123456789abcdef'

/** Minimal cookie jar: supertest does not persist cookies across requests. */
class CookieJar {
  private readonly cookies = new Map<string, string>()

  public store(response: request.Response): void {
    for (const cookie of ([] as string[]).concat(response.headers['set-cookie'] ?? [])) {
      const pair = cookie.split(';')[0]
      const separator = pair.indexOf('=')
      const name = pair.slice(0, separator)
      const value = pair.slice(separator + 1)
      if (value) this.cookies.set(name, value)
      else this.cookies.delete(name)
    }
  }

  public header(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  }
}

/**
 * The controller under test, wired exactly as in production — the provider at
 * the root, the interaction controller in front of it — but on a plain express
 * app (the full Nest wiring is covered by the e2e suite).
 */
const buildApp = (identityAcquirer: IdentityAcquirer | null) => {
  const config = new OidcConfig({
    OIDC_SUB_HMAC_SALT: subHmacSalt,
    OIDC_CLIENTS: JSON.stringify([
      {
        clientId: 'keycloak-broker',
        clientSecret: brokerSecret,
        redirectUris: [brokerRedirectUri],
        loginConfigId: 'default',
      },
      {
        clientId: 'misconfigured-client',
        clientSecret: brokerSecret,
        redirectUris: [brokerRedirectUri],
        loginConfigId: 'does-not-exist',
      },
    ]),
    OIDC_LOGIN_CONFIGS: JSON.stringify([
      {
        id: 'default',
        verificationTemplate: 'default',
        claimMapping: { 'pid.given_name': 'given_name', 'pid.family_name': 'family_name', 'pid.email': 'email' },
        staticClaims: { department: 'QA' },
        subStrategy: 'derived',
        issuerAllowlist: [],
      },
    ]),
  })
  const configService = { oidcConfig: config } as unknown as ConfigService
  const accountClaims = new AccountClaimsStore(configService)
  const provider = createOidcProvider(config, testJwks(), accountClaims)
  const controller = new InteractionController(provider, identityAcquirer, configService, accountClaims)

  const app = express()
  app.use(securityHeaders())
  app.use('/interaction', noStoreMiddleware)
  app.get('/interaction/:uid', (req, res, next) => {
    controller.interaction(req, res).catch(next)
  })
  app.use(provider.callback())
  return { app, accountClaims }
}

const authorizeQuery = (codeVerifier: string, clientId = 'keycloak-broker') => ({
  client_id: clientId,
  redirect_uri: brokerRedirectUri,
  response_type: 'code',
  scope: 'openid',
  state: 'state-value',
  nonce: 'nonce-value',
  code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
  code_challenge_method: 'S256',
})

/**
 * Drives /authorize → interaction (login) → resume → interaction (consent) →
 * resume → redirect back to the client, carrying cookies like a browser, and
 * returns the final redirect back to the client's redirect_uri.
 */
const runAuthorizationFlow = async (app: express.Express, codeVerifier: string, clientId?: string) => {
  const jar = new CookieJar()
  let response = await request(app).get('/authorize').query(authorizeQuery(codeVerifier, clientId)).expect(303)
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

const decodeJwtPayload = (jwt: string): Record<string, any> =>
  JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())

describe('wallet-login interaction (stub login)', () => {
  describe('with the stub enabled', () => {
    const { app, accountClaims } = buildApp(new StubIdentityAcquirer())

    test('completes the full code flow: login, auto-consent, code exchange, userinfo', async () => {
      const codeVerifier = randomBytes(32).toString('base64url')
      const callbackUrl = await runAuthorizationFlow(app, codeVerifier)

      // code released to the client redirect_uri, state echoed verbatim
      expect(callbackUrl.searchParams.get('error')).toBeNull()
      expect(callbackUrl.searchParams.get('state')).toBe('state-value')
      const code = callbackUrl.searchParams.get('code')
      expect(code).toBeTruthy()

      const tokens = await request(app)
        .post('/token')
        .auth('keycloak-broker', brokerSecret)
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
          redirect_uri: brokerRedirectUri,
        })
        .expect(200)

      expect(tokens.body.token_type).toBe('Bearer')
      expect(tokens.body.access_token).toBeDefined()

      const idToken = decodeJwtPayload(tokens.body.id_token)
      expect(idToken.nonce).toBe('nonce-value')
      // stub logins must never look like verified presentations (P1.3.2)
      expect(idToken.amr).toEqual(['stub'])

      // the mapped claim set is stored under the computed sub for findAccount (§4.4)
      const storedClaims = {
        given_name: 'Stub',
        family_name: 'User',
        email: 'stub.user@example.com',
        department: 'QA',
        login_config_id: 'default',
      }
      expect(accountClaims.get(idToken.sub)).toEqual(storedClaims)

      // findAccount (P1.4) releases the claim set into the id_token — every
      // claim must be there because Auth0 never calls userinfo (§1 step 4)
      expect(idToken).toMatchObject(storedClaims)

      // … and userinfo serves the same claims with an identical sub (broker matrix, §1)
      const userinfo = await request(app)
        .get('/userinfo')
        .set('Authorization', `Bearer ${tokens.body.access_token}`)
        .expect(200)
      expect(userinfo.body.sub).toBe(idToken.sub)
      expect(userinfo.body).toMatchObject(storedClaims)
    })

    test('derived sub is stable across logins (§4.3)', async () => {
      const firstVerifier = randomBytes(32).toString('base64url')
      const firstCallback = await runAuthorizationFlow(app, firstVerifier)
      const secondVerifier = randomBytes(32).toString('base64url')
      const secondCallback = await runAuthorizationFlow(app, secondVerifier)

      const exchange = async (callbackUrl: URL, codeVerifier: string) =>
        await request(app)
          .post('/token')
          .auth('keycloak-broker', brokerSecret)
          .type('form')
          .send({
            grant_type: 'authorization_code',
            code: callbackUrl.searchParams.get('code'),
            code_verifier: codeVerifier,
            redirect_uri: brokerRedirectUri,
          })
          .expect(200)

      const first = decodeJwtPayload((await exchange(firstCallback, firstVerifier)).body.id_token)
      const second = decodeJwtPayload((await exchange(secondCallback, secondVerifier)).body.id_token)
      expect(first.sub).toBe(second.sub)
    })

    test('fails the flow for a client without a login configuration', async () => {
      const callbackUrl = await runAuthorizationFlow(app, randomBytes(32).toString('base64url'), 'misconfigured-client')

      expect(callbackUrl.searchParams.get('error')).toBe('server_error')
      expect(callbackUrl.searchParams.get('code')).toBeNull()
    })
  })

  describe('with no acquisition method enabled', () => {
    test('denies the login instead of stubbing it', async () => {
      const { app } = buildApp(null)
      const callbackUrl = await runAuthorizationFlow(app, randomBytes(32).toString('base64url'))

      expect(callbackUrl.searchParams.get('error')).toBe('access_denied')
      expect(callbackUrl.searchParams.get('code')).toBeNull()
    })
  })
})

describe('response hardening (security headers)', () => {
  const { app } = buildApp(new StubIdentityAcquirer())

  test('interaction responses are uncacheable and unframeable', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const authorize = await request(app).get('/authorize').query(authorizeQuery(codeVerifier)).expect(303)
    const jar = new CookieJar()
    jar.store(authorize)
    const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname

    const interaction = await request(app).get(interactionPath).set('Cookie', jar.header()).expect(303)
    expect(interaction.headers['cache-control']).toBe('no-store')
    expect(interaction.headers['pragma']).toBe('no-cache')
    expect(interaction.headers['x-frame-options']).toBe('DENY')
    expect(interaction.headers['content-security-policy']).toBe("frame-ancestors 'none'")
  })

  test('framing is denied on provider endpoints too, while discovery stays cacheable', async () => {
    const discovery = await request(app).get('/.well-known/openid-configuration').expect(200)
    expect(discovery.headers['x-frame-options']).toBe('DENY')
    expect(discovery.headers['content-security-policy']).toBe("frame-ancestors 'none'")
    // no-store is scoped to /interaction — RPs are expected to cache discovery/JWKS
    expect(discovery.headers['cache-control']).not.toBe('no-store')
  })
})
