import { createHash, randomBytes } from 'node:crypto'

import express from 'express'
import request from 'supertest'

import { securityHeaders } from '../../src/common/middleware'
import { ConfigService, OidcConfig } from '../../src/core/config'
import {
  AccountClaimsStore,
  assertWalletAuthorizationRequest,
  createOidcProvider,
  InteractionController,
  InteractionService,
  LoginEventsService,
  noStoreMiddleware,
  VerificationSessionClient,
  VerificationSessionState,
  WalletIdentityAcquirer,
} from '../../src/oidc'
import { testJwks } from '../helpers/jwks'

const brokerRedirectUri = 'https://kc.example.com/realms/r/broker/heka-sso/endpoint'
const brokerSecret = 'broker-secret-value-long-enough'

const dcqlQuery = {
  credentials: [{ id: 'pid', format: 'dc+sd-jwt', claims: [{ path: ['given_name'] }, { path: ['family_name'] }] }],
}

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

describe('wallet-login interaction', () => {
  const sessionsMock = {
    createSignedRequest: vi.fn(),
    createDcApiRequest: vi.fn(),
    verifyDcApiResponse: vi.fn(),
    getSession: vi.fn(),
  }

  const config = new OidcConfig({
    OIDC_SUB_HMAC_SALT: 'unit-test-sub-hmac-salt-0123456789abcdef',
    OIDC_CLIENTS: JSON.stringify([
      {
        clientId: 'keycloak-broker',
        clientSecret: brokerSecret,
        redirectUris: [brokerRedirectUri],
        loginConfigId: 'default',
      },
    ]),
    OIDC_LOGIN_CONFIGS: JSON.stringify([
      {
        id: 'default',
        verificationTemplate: 'default',
        dcqlQuery,
        claimMapping: { 'pid.given_name': 'given_name', 'pid.family_name': 'family_name' },
        subStrategy: 'derived',
        issuerAllowlist: [],
        // per-client login-page branding, served via GET :uid/branding
        branding: {
          productName: 'Acme ID',
          logoUrl: '/interaction/assets/acme.svg',
          colors: { 'brand-primary': '#123456' },
        },
      },
    ]),
  })
  const configService = { oidcConfig: config } as unknown as ConfigService
  const accountClaims = new AccountClaimsStore(configService)
  const provider = createOidcProvider(config, testJwks(), accountClaims)
  const loginEventsMock = { registerSession: vi.fn() }
  const acquirer = new WalletIdentityAcquirer(
    sessionsMock as unknown as VerificationSessionClient,
    configService,
    loginEventsMock as unknown as LoginEventsService
  )
  const controller = new InteractionController(provider, new InteractionService(provider, acquirer, configService, accountClaims))

  const app = express()
  app.use(securityHeaders())
  app.use('/interaction', noStoreMiddleware)
  app.use('/interaction', express.json())
  app.get('/interaction/:uid', (req, res, next) => {
    controller.interaction(req, res).catch(next)
  })
  app.get('/interaction/:uid/data', (req, res, next) => {
    controller.data(req, res).catch(next)
  })
  app.get('/interaction/:uid/branding', (req, res, next) => {
    controller.branding(req, res).catch(next)
  })
  app.post('/interaction/:uid/dc-api/start', (req, res, next) => {
    controller.dcApiStart(req, res).catch(next)
  })
  app.post('/interaction/:uid/dc-api/verify', (req, res, next) => {
    controller.dcApiVerify(req, res, req.body).catch(next)
  })
  app.get('/interaction/:uid/status', (req, res, next) => {
    controller.status(req, res).catch(next)
  })
  app.get('/interaction/:uid/complete', (req, res, next) => {
    controller.complete(req, res).catch(next)
  })
  app.use(provider.callback())

  beforeEach(() => {
    sessionsMock.createSignedRequest.mockReset()
    sessionsMock.createDcApiRequest.mockReset()
    sessionsMock.verifyDcApiResponse.mockReset()
    sessionsMock.getSession.mockReset()
    loginEventsMock.registerSession.mockReset()
    sessionsMock.createSignedRequest.mockResolvedValue({
      sessionId: 'vs-1',
      authorizationRequest: 'openid4vp://?request_uri=https%3A%2F%2Fis%2Foid4vp%2Fabc',
    })
    sessionsMock.createDcApiRequest.mockResolvedValue({
      sessionId: 'vs-dc-1',
      protocol: 'openid4vp-v1-signed',
      authorizationRequestObject: { request: 'signed-jar-jwt' },
    })
  })

  const startFlow = async (codeVerifier: string) => {
    const jar = new CookieJar()
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
    const interactionPath = new URL(authorize.headers.location, 'http://localhost').pathname
    return { jar, interactionPath }
  }

  const followTo = async (jar: CookieJar, location: string) => {
    let current = location
    for (let hop = 0; hop < 6 && !current.startsWith(brokerRedirectUri); hop++) {
      const { pathname, search } = new URL(current, 'http://localhost')
      const response = await request(app).get(`${pathname}${search}`).set('Cookie', jar.header()).expect(303)
      jar.store(response)
      current = response.headers.location
    }
    return new URL(current)
  }

  const exchangeCode = async (code: string | null, codeVerifier: string) =>
    await request(app)
      .post('/token')
      .auth('keycloak-broker', brokerSecret)
      .type('form')
      .send({ grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: brokerRedirectUri })
      .expect(200)

  test('serves the static login page — no verification session until a path engages', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)

    const page = await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
    expect(page.text).toContain('Sign in with your wallet')
    // the page logic is a built artifact — the page links the bundle,
    // whose DC API/branding behavior is asserted in assets.controller.spec.ts
    expect(page.text).toContain('/interaction/assets/login.js')
    expect(page.text).toContain('/interaction/assets/styles.css')
    // static page: nothing interaction-specific baked in, no session created yet
    expect(page.text).not.toContain(interactionPath)
    expect(sessionsMock.createSignedRequest).not.toHaveBeenCalled()
    expect(sessionsMock.createDcApiRequest).not.toHaveBeenCalled()
  })

  test('branding: the login config branding is served to the page, cookie-bound', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)

    // the static page links the shared assets and the branding hooks
    const page = await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
    expect(page.text).toContain('/interaction/assets/styles.css')
    expect(page.text).toContain('id="brand-name"') // the branding hooks live in the markup

    const branding = await request(app).get(`${interactionPath}/branding`).set('Cookie', jar.header()).expect(200)
    expect(branding.body).toEqual({
      productName: 'Acme ID',
      logoUrl: '/interaction/assets/acme.svg',
      colors: { 'brand-primary': '#123456' },
    })
    // cosmetic read only — no verification session was created
    expect(sessionsMock.createSignedRequest).not.toHaveBeenCalled()
    expect(sessionsMock.createDcApiRequest).not.toHaveBeenCalled()

    // without the interaction cookie the branding (like every route) is refused
    const uncookied = await request(app).get(`${interactionPath}/branding`).expect(400)
    expect(uncookied.body.status).toBe('error')
  })

  test('QR fallback: data → poll → complete → tokens with amr vc', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    const page = await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)

    // the data call creates the direct_post session and returns QR + deep link
    const data = await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)
    expect(sessionsMock.createSignedRequest).toHaveBeenCalledTimes(1)
    expect(data.body.qrDataUrl).toContain('data:image/png;base64')
    expect(data.body.authorizationRequest).toContain('openid4vp://?request_uri=')
    // the interaction surface hands out single-use authorization requests: never cached, never framed
    expect(page.headers['cache-control']).toBe('no-store')
    expect(page.headers['pragma']).toBe('no-cache')
    expect(page.headers['x-frame-options']).toBe('DENY')
    expect(page.headers['content-security-policy']).toBe("frame-ancestors 'none'")
    // the session is routed for WebSocket push
    expect(loginEventsMock.registerSession).toHaveBeenCalledWith('vs-1', interactionPath.split('/')[2])

    // polling: pending while the wallet has not responded
    sessionsMock.getSession.mockResolvedValueOnce({ id: 'vs-1', state: VerificationSessionState.RequestUriRetrieved })
    const pending = await request(app).get(`${interactionPath}/status`).set('Cookie', jar.header()).expect(200)
    expect(pending.body).toEqual({ status: 'pending' })
    expect(pending.headers['cache-control']).toBe('no-store') // polled per-interaction JSON is uncacheable too

    // …then verified once heka-identity-service marks the session
    sessionsMock.getSession.mockResolvedValue({
      id: 'vs-1',
      state: VerificationSessionState.ResponseVerified,
      sharedAttributes: { given_name: 'Ada', family_name: 'Lovelace', birthdate: '1815-12-10' },
    })
    const verified = await request(app).get(`${interactionPath}/status`).set('Cookie', jar.header()).expect(200)
    expect(verified.body).toEqual({ status: 'verified' })

    // completion happens in the same cookie-bound browser session
    const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
    jar.store(complete)
    const callbackUrl = await followTo(jar, complete.headers.location)
    expect(callbackUrl.searchParams.get('error')).toBeNull()

    const tokens = await exchangeCode(callbackUrl.searchParams.get('code'), codeVerifier)
    const idToken = JSON.parse(Buffer.from(tokens.body.id_token.split('.')[1], 'base64url').toString())
    expect(idToken.amr).toEqual(['vc'])
    // disclosed attributes mapped per login config (query-id-prefixed paths)
    expect(idToken).toMatchObject({ given_name: 'Ada', family_name: 'Lovelace', login_config_id: 'default' })
    // the full disclosed set is published under vc_presented_attributes
    expect(idToken.vc_presented_attributes).toEqual({
      given_name: 'Ada',
      family_name: 'Lovelace',
      birthdate: '1815-12-10',
    })
  })

  test('DC API path: start → verify (origin-bound) → complete → tokens with amr vc', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)

    // start: the dc_api session is created, bound to the bridge's own origin (from OIDC_ISSUER_URL)
    const start = await request(app).post(`${interactionPath}/dc-api/start`).set('Cookie', jar.header()).expect(200)
    expect(start.body).toEqual({ protocol: 'openid4vp-v1-signed', request: { request: 'signed-jar-jwt' } })
    const defaultLoginConfig = config.loginConfigs[0]
    expect(sessionsMock.createDcApiRequest).toHaveBeenCalledWith(defaultLoginConfig, 'http://localhost:3005')
    expect(sessionsMock.createSignedRequest).not.toHaveBeenCalled() // no wasted direct_post session
    expect(loginEventsMock.registerSession).toHaveBeenCalledWith('vs-dc-1', interactionPath.split('/')[2])

    // verify: the wallet's response is forwarded with the bridge origin — never a client-supplied one
    const walletResponse = { vp_token: { pid: ['eyJhbGciOi…'] } }
    sessionsMock.verifyDcApiResponse.mockResolvedValue({
      id: 'vs-dc-1',
      state: VerificationSessionState.ResponseVerified,
      sharedAttributes: { given_name: 'Ada', family_name: 'Lovelace' },
    })
    const verify = await request(app)
      .post(`${interactionPath}/dc-api/verify`)
      .set('Cookie', jar.header())
      .send({ authorizationResponse: walletResponse, origin: 'https://evil.example.com' })
      .expect(200)
    expect(verify.body).toEqual({ status: 'verified' })
    expect(sessionsMock.verifyDcApiResponse).toHaveBeenCalledWith('vs-dc-1', walletResponse, 'http://localhost:3005')

    // completion re-validates the session server-side and runs the claims pipeline
    sessionsMock.getSession.mockResolvedValue({
      id: 'vs-dc-1',
      state: VerificationSessionState.ResponseVerified,
      sharedAttributes: { given_name: 'Ada', family_name: 'Lovelace' },
    })
    const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
    jar.store(complete)
    const callbackUrl = await followTo(jar, complete.headers.location)
    expect(callbackUrl.searchParams.get('error')).toBeNull()

    const tokens = await exchangeCode(callbackUrl.searchParams.get('code'), codeVerifier)
    const idToken = JSON.parse(Buffer.from(tokens.body.id_token.split('.')[1], 'base64url').toString())
    expect(idToken.amr).toEqual(['vc'])
    expect(idToken).toMatchObject({ given_name: 'Ada', family_name: 'Lovelace', login_config_id: 'default' })
  })

  test('DC API verify failure surfaces as an error status — completion still refused', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
    await request(app).post(`${interactionPath}/dc-api/start`).set('Cookie', jar.header()).expect(200)

    sessionsMock.verifyDcApiResponse.mockRejectedValue(new Error('identity-service 422: origin mismatch'))
    const verify = await request(app)
      .post(`${interactionPath}/dc-api/verify`)
      .set('Cookie', jar.header())
      .send({ authorizationResponse: { vp_token: {} } })
      .expect(200)
    // generic message only — identity-service detail stays in the server log
    expect(verify.body).toEqual({ status: 'error', message: 'The presentation could not be verified.' })

    sessionsMock.getSession.mockResolvedValue({ id: 'vs-dc-1', state: VerificationSessionState.RequestCreated })
    const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
    jar.store(complete)
    const callbackUrl = await followTo(jar, complete.headers.location)
    expect(callbackUrl.searchParams.get('error')).toBe('access_denied')
  })

  test('DC API verify without an authorizationResponse body is rejected', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
    await request(app).post(`${interactionPath}/dc-api/start`).set('Cookie', jar.header()).expect(200)

    const verify = await request(app).post(`${interactionPath}/dc-api/verify`).set('Cookie', jar.header()).send({}).expect(400)
    expect(verify.body.status).toBe('error')
    expect(sessionsMock.verifyDcApiResponse).not.toHaveBeenCalled()
  })

  test('reports a failed verification to the polling page', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
    await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)

    sessionsMock.getSession.mockResolvedValue({
      id: 'vs-1',
      state: VerificationSessionState.Error,
      errorMessage: 'presentation signature invalid',
    })
    const status = await request(app).get(`${interactionPath}/status`).set('Cookie', jar.header()).expect(200)
    expect(status.body).toEqual({ status: 'error', message: 'presentation signature invalid' })
  })

  test('refuses completion while the session is not verified — access_denied back to the client', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
    await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)

    sessionsMock.getSession.mockResolvedValue({ id: 'vs-1', state: VerificationSessionState.RequestCreated })
    const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
    jar.store(complete)
    const callbackUrl = await followTo(jar, complete.headers.location)
    expect(callbackUrl.searchParams.get('error')).toBe('access_denied')
    expect(callbackUrl.searchParams.get('code')).toBeNull()
  })

  test('a verified session that disclosed nothing is refused — no shared account is minted', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
    await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)

    // heka-identity-service returns no sharedAttributes (e.g. an empty DCQL presentation entry list)
    sessionsMock.getSession.mockResolvedValue({ id: 'vs-1', state: VerificationSessionState.ResponseVerified })
    const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
    jar.store(complete)
    const callbackUrl = await followTo(jar, complete.headers.location)
    expect(callbackUrl.searchParams.get('error')).toBe('access_denied')
    expect(callbackUrl.searchParams.get('code')).toBeNull()
  })

  test('a disclosure the login config maps to no claim is refused — the sub would be shared', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
    await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(200)

    // attributes were disclosed, but none of them is in claimMapping: the mapped claim set — and
    // with it the derived sub — would be identical for every user of this login configuration
    sessionsMock.getSession.mockResolvedValue({
      id: 'vs-1',
      state: VerificationSessionState.ResponseVerified,
      sharedAttributes: { nationality: 'GB' },
    })
    const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
    jar.store(complete)
    const callbackUrl = await followTo(jar, complete.headers.location)
    expect(callbackUrl.searchParams.get('error')).toBe('access_denied')
    expect(callbackUrl.searchParams.get('code')).toBeNull()
  })

  test('interaction API without the interaction cookie is rejected — no session leakage', async () => {
    for (const [method, path] of [
      ['get', '/interaction/some-uid/status'],
      ['get', '/interaction/some-uid/data'],
      ['post', '/interaction/some-uid/dc-api/start'],
      ['post', '/interaction/some-uid/dc-api/verify'],
    ] as const) {
      const response = await (method === 'get' ? request(app).get(path) : request(app).post(path)).expect(400)
      expect(response.body.status).toBe('error')
    }
    expect(sessionsMock.createSignedRequest).not.toHaveBeenCalled()
    expect(sessionsMock.createDcApiRequest).not.toHaveBeenCalled()
    expect(sessionsMock.verifyDcApiResponse).not.toHaveBeenCalled()
  })

  test('a failed session-creation call surfaces as a JSON error on the data route', async () => {
    sessionsMock.createSignedRequest.mockRejectedValue(new Error('identity-service down'))
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)

    const data = await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(400)
    expect(data.body.status).toBe('error')
  })

  test('an authorization request with a non-wallet scheme is never rendered — fails closed', async () => {
    // HTML escaping does not neutralize a browser scheme in an href — the boundary check must
    sessionsMock.createSignedRequest.mockResolvedValue({
      sessionId: 'vs-evil',
      authorizationRequest: 'javascript:alert(1)',
    })
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)

    // the data route fails closed with a generic JSON error — no deep link, no QR
    const data = await request(app).get(`${interactionPath}/data`).set('Cookie', jar.header()).expect(400)
    expect(data.body).toEqual({ status: 'error', message: 'The sign-in attempt could not be started.' })
    expect(data.text).not.toContain('javascript:')

    // the poisoned session was never stored: polling finds no pending login and never looks it up
    const status = await request(app).get(`${interactionPath}/status`).set('Cookie', jar.header()).expect(200)
    expect(status.body.status).toBe('error')
    expect(sessionsMock.getSession).not.toHaveBeenCalled()
  })
})

describe('assertWalletAuthorizationRequest', () => {
  test.each([
    'openid4vp://?request_uri=https%3A%2F%2Fis%2Foid4vp%2Fabc',
    'haip://?client_id=x509_san_dns%3Averifier.example&request_uri=https%3A%2F%2Fis%2Fjar%2F1',
    'eudi-openid4vp://?request_uri=https%3A%2F%2Fis%2Fjar%2F1',
    'mdoc-openid4vp://?request_uri=https%3A%2F%2Fis%2Fjar%2F1',
  ])('accepts wallet invocation URIs: %s', (uri) => {
    expect(assertWalletAuthorizationRequest(uri)).toBe(uri)
  })

  test.each([
    ['javascript:alert(1)', /unexpected scheme 'javascript:'/],
    ['data:text/html,hi', /unexpected scheme 'data:'/],
    ['https://phish.example/?request_uri=https%3A%2F%2Fis%2Fjar%2F1', /unexpected scheme 'https:'/],
    ['openid4vp://?client_id=x&response_type=vp_token', /request_uri missing/],
    ['not a uri', /not a valid URI/],
    ['', /not a valid URI/],
  ])('rejects %s', (uri, message) => {
    expect(() => assertWalletAuthorizationRequest(uri)).toThrow(message)
  })
})
