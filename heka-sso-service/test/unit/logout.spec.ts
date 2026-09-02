import { createHash, randomBytes } from 'node:crypto'
import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'

import express, { Express } from 'express'
import request from 'supertest'

import { ConfigService, OidcConfig } from '../../src/core/config'
import {
  AccountClaimsStore,
  createOidcProvider,
  InteractionController,
  StubIdentityAcquirer,
} from '../../src/oidc'
import { testJwks } from '../helpers/jwks'

const brokerRedirectUri = 'https://kc.example.com/realms/r/broker/heka-sso/endpoint'
const brokerPostLogoutUri = 'https://kc.example.com/realms/r/broker/heka-sso/endpoint/logout_response'
const brokerSecret = 'broker-secret-value-long-enough'

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

const decodeJwtPayload = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())

/**
 * Logout (P2.5/P2.5.1): RP-initiated logout with the custom confirmation page
 * (auto-confirm on a valid id_token_hint), post-logout redirect with state,
 * and the back-channel logout_token (`sid`-matched) POSTed to the registered
 * receiver — the stub login stands in for the wallet presentation.
 */
describe('logout (P2.5)', () => {
  let backchannelServer: Server
  let backchannelRequests: { path: string; body: string }[]

  let app: Express

  beforeAll(async () => {
    backchannelRequests = []
    backchannelServer = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        backchannelRequests.push({ path: req.url ?? '', body })
        res.writeHead(200).end()
      })
    })
    await new Promise<void>((resolve) => backchannelServer.listen(0, '127.0.0.1', resolve))
    const backchannelPort = (backchannelServer.address() as AddressInfo).port

    const config = new OidcConfig({
      OIDC_SUB_HMAC_SALT: 'unit-test-sub-hmac-salt-0123456789abcdef',
      // the receiver below is on 127.0.0.1 — drop the SSRF dispatcher (dev flag)
      OIDC_ALLOW_PRIVATE_NETWORK_CALLS: 'true',
      // this suite exercises the opt-in auto-confirm path (P2.5.1)
      OIDC_LOGOUT_AUTO_CONFIRM: 'true',
      OIDC_CLIENTS: JSON.stringify([
        {
          clientId: 'keycloak-broker',
          clientSecret: brokerSecret,
          redirectUris: [brokerRedirectUri],
          postLogoutRedirectUris: [brokerPostLogoutUri],
          backchannelLogoutUri: `http://127.0.0.1:${backchannelPort}/backchannel-logout`,
          loginConfigId: 'default',
        },
      ]),
      OIDC_LOGIN_CONFIGS: JSON.stringify([
        {
          id: 'default',
          verificationTemplate: 'default',
          claimMapping: { 'pid.given_name': 'given_name' },
          subStrategy: 'derived',
          issuerAllowlist: [],
        },
      ]),
    })
    const configService = { oidcConfig: config } as unknown as ConfigService
    const accountClaims = new AccountClaimsStore(configService)
    const provider = createOidcProvider(config, testJwks(), accountClaims)
    const controller = new InteractionController(provider, new StubIdentityAcquirer(), configService, accountClaims)

    app = express()
    app.get('/interaction/:uid', (req, res, next) => {
      controller.interaction(req, res).catch(next)
    })
    app.use(provider.callback())
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => backchannelServer.close(() => resolve()))
  })

  beforeEach(() => {
    backchannelRequests.length = 0
  })

  /** Full stub-login code flow; returns the session cookie jar and the issued id_token. */
  const login = async () => {
    const jar = new CookieJar()
    const codeVerifier = randomBytes(32).toString('base64url')
    const authorize = await request(app)
      .get('/authorize')
      .query({
        client_id: 'keycloak-broker',
        redirect_uri: brokerRedirectUri,
        response_type: 'code',
        scope: 'openid',
        state: 'state-value',
        nonce: 'nonce-value',
        code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
        code_challenge_method: 'S256',
      })
      .expect(303)
    jar.store(authorize)

    let location = authorize.headers.location
    for (let hop = 0; hop < 6 && !location.startsWith(brokerRedirectUri); hop++) {
      const { pathname, search } = new URL(location, 'http://localhost')
      const response = await request(app).get(`${pathname}${search}`).set('Cookie', jar.header()).expect(303)
      jar.store(response)
      location = response.headers.location
    }
    const code = new URL(location).searchParams.get('code')

    const tokens = await request(app)
      .post('/token')
      .auth('keycloak-broker', brokerSecret)
      .type('form')
      .send({ grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: brokerRedirectUri })
      .expect(200)
    return { jar, idToken: tokens.body.id_token as string }
  }

  const xsrfFrom = (html: string): string => {
    const match = /name="xsrf" value="([^"]+)"/.exec(html)
    expect(match).not.toBeNull()
    return match![1]
  }

  test('id_tokens carry sid — the session reference for sid-matched logout', async () => {
    const { idToken } = await login()
    expect(decodeJwtPayload(idToken).sid).toEqual(expect.any(String))
  })

  test('RP-initiated logout with id_token_hint: auto-confirm page → post-logout redirect with state → backchannel logout_token (P2.5.1)', async () => {
    const { jar, idToken } = await login()
    const sid = decodeJwtPayload(idToken).sid

    // the confirmation page auto-submits when the request carries a valid id_token_hint
    const confirmPage = await request(app)
      .get('/session/end')
      .query({ id_token_hint: idToken, post_logout_redirect_uri: brokerPostLogoutUri, state: 'kc-logout-state' })
      .set('Cookie', jar.header())
      .expect(200)
    expect(confirmPage.text).toContain('Signing you out')
    expect(confirmPage.text).toContain("confirm.name = 'logout'")
    expect(confirmPage.text).not.toContain('Do you want to sign out')
    jar.store(confirmPage)

    // ... which POSTs the embedded XSRF form with logout=yes
    const confirmed = await request(app)
      .post('/session/end/confirm')
      .type('form')
      .set('Cookie', jar.header())
      .send({ xsrf: xsrfFrom(confirmPage.text), logout: 'yes' })
      .expect(303)
    const redirect = new URL(confirmed.headers.location)
    expect(`${redirect.origin}${redirect.pathname}`).toBe(brokerPostLogoutUri)
    expect(redirect.searchParams.get('state')).toBe('kc-logout-state')

    // the registered receiver got the sid-matched logout_token (P2.5)
    expect(backchannelRequests).toHaveLength(1)
    expect(backchannelRequests[0].path).toBe('/backchannel-logout')
    const logoutToken = decodeJwtPayload(new URLSearchParams(backchannelRequests[0].body).get('logout_token')!)
    expect(logoutToken.iss).toBe('http://localhost:3005')
    expect(logoutToken.aud).toBe('keycloak-broker')
    expect(logoutToken.events).toHaveProperty('http://schemas.openid.net/event/backchannel-logout')
    expect(logoutToken.sid).toBe(sid)
    expect(logoutToken.sub).toEqual(expect.any(String))
    expect(logoutToken.jti).toEqual(expect.any(String))
  })

  test('the session is really gone: a follow-up authorize requires a fresh login', async () => {
    const { jar, idToken } = await login()

    const confirmPage = await request(app)
      .get('/session/end')
      .query({ id_token_hint: idToken, post_logout_redirect_uri: brokerPostLogoutUri })
      .set('Cookie', jar.header())
      .expect(200)
    jar.store(confirmPage)
    const confirmed = await request(app)
      .post('/session/end/confirm')
      .type('form')
      .set('Cookie', jar.header())
      .send({ xsrf: xsrfFrom(confirmPage.text), logout: 'yes' })
      .expect(303)
    jar.store(confirmed)

    // prompt=none must now fail — no session left to silently reuse
    const codeVerifier = randomBytes(32).toString('base64url')
    const silent = await request(app)
      .get('/authorize')
      .query({
        client_id: 'keycloak-broker',
        redirect_uri: brokerRedirectUri,
        response_type: 'code',
        scope: 'openid',
        prompt: 'none',
        code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
        code_challenge_method: 'S256',
      })
      .set('Cookie', jar.header())
      .expect(303)
    expect(new URL(silent.headers.location).searchParams.get('error')).toBe('login_required')
  })

  test('hint-less logout keeps the interactive confirmation (CSRF protection)', async () => {
    const { jar } = await login()

    const confirmPage = await request(app).get('/session/end').set('Cookie', jar.header()).expect(200)
    expect(confirmPage.text).toContain('Do you want to sign out')
    expect(confirmPage.text).toContain('name="logout"')
    expect(confirmPage.text).not.toContain('Signing you out')
    expect(confirmPage.text).not.toContain('form.submit()')
  })

  test('an unregistered post_logout_redirect_uri is rejected', async () => {
    const { jar, idToken } = await login()

    const response = await request(app)
      .get('/session/end')
      .query({ id_token_hint: idToken, post_logout_redirect_uri: 'https://evil.example.com/return' })
      .set('Cookie', jar.header())
      .expect(400)
    expect(response.body.error).toBe('invalid_request')
    expect(response.body.error_description).toContain('post_logout_redirect_uri')
  })

  test('production refuses the private-network escape hatch (SSRF protection stays on)', () => {
    expect(
      () =>
        new OidcConfig({
          NODE_ENV: 'production',
          OIDC_ALLOW_PRIVATE_NETWORK_CALLS: 'true',
        }),
    ).toThrow(/OIDC_ALLOW_PRIVATE_NETWORK_CALLS/)
  })
})

/**
 * Default behavior (auto-confirm off): the confirmation dialog is shown on
 * every RP-initiated logout — id_token_hint or not — and confirming it still
 * completes the logout.
 */
describe('logout confirmation dialog (default — OIDC_LOGOUT_AUTO_CONFIRM off)', () => {
  const config = new OidcConfig({
    OIDC_SUB_HMAC_SALT: 'unit-test-sub-hmac-salt-0123456789abcdef',
    OIDC_CLIENTS: JSON.stringify([
      {
        clientId: 'keycloak-broker',
        clientSecret: brokerSecret,
        redirectUris: [brokerRedirectUri],
        postLogoutRedirectUris: [brokerPostLogoutUri],
        loginConfigId: 'default',
      },
    ]),
    OIDC_LOGIN_CONFIGS: JSON.stringify([
      {
        id: 'default',
        verificationTemplate: 'default',
        claimMapping: { 'pid.given_name': 'given_name' },
        subStrategy: 'derived',
        issuerAllowlist: [],
      },
    ]),
  })
  const configService = { oidcConfig: config } as unknown as ConfigService
  const accountClaims = new AccountClaimsStore(configService)
  const provider = createOidcProvider(config, testJwks(), accountClaims)
  const controller = new InteractionController(provider, new StubIdentityAcquirer(), configService, accountClaims)

  const app = express()
  app.get('/interaction/:uid', (req, res, next) => {
    controller.interaction(req, res).catch(next)
  })
  app.use(provider.callback())

  test('a hint-carrying logout still shows the dialog, and confirming it signs the user out', async () => {
    // sign in
    const jar = new CookieJar()
    const codeVerifier = randomBytes(32).toString('base64url')
    const authorize = await request(app)
      .get('/authorize')
      .query({
        client_id: 'keycloak-broker',
        redirect_uri: brokerRedirectUri,
        response_type: 'code',
        scope: 'openid',
        nonce: 'nonce-value',
        code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
        code_challenge_method: 'S256',
      })
      .expect(303)
    jar.store(authorize)
    let location = authorize.headers.location
    for (let hop = 0; hop < 6 && !location.startsWith(brokerRedirectUri); hop++) {
      const { pathname, search } = new URL(location, 'http://localhost')
      const response = await request(app).get(`${pathname}${search}`).set('Cookie', jar.header()).expect(303)
      jar.store(response)
      location = response.headers.location
    }
    const tokens = await request(app)
      .post('/token')
      .auth('keycloak-broker', brokerSecret)
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: new URL(location).searchParams.get('code'),
        code_verifier: codeVerifier,
        redirect_uri: brokerRedirectUri,
      })
      .expect(200)

    // the dialog renders despite the id_token_hint — no self-submit
    const confirmPage = await request(app)
      .get('/session/end')
      .query({ id_token_hint: tokens.body.id_token, post_logout_redirect_uri: brokerPostLogoutUri })
      .set('Cookie', jar.header())
      .expect(200)
    expect(confirmPage.text).toContain('Do you want to sign out')
    expect(confirmPage.text).not.toContain('Signing you out')
    expect(confirmPage.text).not.toContain('form.submit()')
    jar.store(confirmPage)

    // clicking "Yes, sign me out" completes the logout
    const xsrf = /name="xsrf" value="([^"]+)"/.exec(confirmPage.text)![1]
    const confirmed = await request(app)
      .post('/session/end/confirm')
      .type('form')
      .set('Cookie', jar.header())
      .send({ xsrf, logout: 'yes' })
      .expect(303)
    const redirect = new URL(confirmed.headers.location)
    expect(`${redirect.origin}${redirect.pathname}`).toBe(brokerPostLogoutUri)
  })

  test('discovery advertises the logout surface', async () => {
    const discovery = await request(app).get('/.well-known/openid-configuration').expect(200)
    expect(discovery.body.end_session_endpoint).toContain('/session/end')
    expect(discovery.body.backchannel_logout_supported).toBe(true)
    expect(discovery.body.backchannel_logout_session_supported).toBe(true)
  })
})
