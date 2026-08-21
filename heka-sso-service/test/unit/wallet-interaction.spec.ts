import { createHash, randomBytes } from 'node:crypto'

import express from 'express'
import request from 'supertest'

import { ConfigService, OidcConfig } from '../../src/core/config'
import {
  AccountClaimsStore,
  createOidcProvider,
  InteractionController,
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

/**
 * Wallet-login interaction (P1.6): QR login page, status polling (P1.6.3),
 * cookie-bound completion, and the disclosed-attribute claims pipeline —
 * against a mocked identity-service verification-session client.
 */
describe('wallet-login interaction (P1.6)', () => {
  const sessionsMock = {
    createSignedRequest: vi.fn(),
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
      },
    ]),
  })
  const configService = { oidcConfig: config } as unknown as ConfigService
  const accountClaims = new AccountClaimsStore(configService)
  const provider = createOidcProvider(config, testJwks(), accountClaims)
  const acquirer = new WalletIdentityAcquirer(
    sessionsMock as unknown as VerificationSessionClient,
    configService,
  )
  const controller = new InteractionController(provider, acquirer, configService, accountClaims)

  const app = express()
  app.get('/interaction/:uid', (req, res, next) => {
    controller.interaction(req, res).catch(next)
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
    sessionsMock.getSession.mockReset()
    sessionsMock.createSignedRequest.mockResolvedValue({
      sessionId: 'vs-1',
      authorizationRequest: 'openid4vp://?request_uri=https%3A%2F%2Fis%2Foid4vp%2Fabc',
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

  test('renders the QR login page and drives poll → complete → tokens with amr vc (P1.6.3)', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)

    // login prompt renders the wallet login page (verification session created — signed, P1.6.1)
    const page = await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)
    expect(sessionsMock.createSignedRequest).toHaveBeenCalledTimes(1)
    expect(page.text).toContain('data:image/png;base64') // QR
    expect(page.text).toContain('openid4vp://?request_uri=') // deep link
    expect(page.text).toContain(`${interactionPath}/status`) // polling target

    // polling: pending while the wallet has not responded (P1.6.3)
    sessionsMock.getSession.mockResolvedValueOnce({ id: 'vs-1', state: VerificationSessionState.RequestUriRetrieved })
    const pending = await request(app).get(`${interactionPath}/status`).set('Cookie', jar.header()).expect(200)
    expect(pending.body).toEqual({ status: 'pending' })

    // …then verified once heka-identity-service marks the session
    sessionsMock.getSession.mockResolvedValue({
      id: 'vs-1',
      state: VerificationSessionState.ResponseVerified,
      sharedAttributes: { given_name: 'Ada', family_name: 'Lovelace', birthdate: '1815-12-10' },
    })
    const verified = await request(app).get(`${interactionPath}/status`).set('Cookie', jar.header()).expect(200)
    expect(verified.body).toEqual({ status: 'verified' })

    // completion happens in the same cookie-bound browser session (§3.3)
    const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
    jar.store(complete)
    const callbackUrl = await followTo(jar, complete.headers.location)
    expect(callbackUrl.searchParams.get('error')).toBeNull()
    const code = callbackUrl.searchParams.get('code')

    const tokens = await request(app)
      .post('/token')
      .auth('keycloak-broker', brokerSecret)
      .type('form')
      .send({ grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: brokerRedirectUri })
      .expect(200)

    const idToken = JSON.parse(Buffer.from(tokens.body.id_token.split('.')[1], 'base64url').toString())
    expect(idToken.amr).toEqual(['vc'])
    // disclosed attributes mapped per login config (query-id-prefixed paths)
    expect(idToken).toMatchObject({ given_name: 'Ada', family_name: 'Lovelace', login_config_id: 'default' })
    // the full disclosed set is published under vc_presented_attributes (§3.5)
    expect(idToken.vc_presented_attributes).toEqual({
      given_name: 'Ada',
      family_name: 'Lovelace',
      birthdate: '1815-12-10',
    })
  })

  test('reports a failed verification to the polling page', async () => {
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)
    await request(app).get(interactionPath).set('Cookie', jar.header()).expect(200)

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

    sessionsMock.getSession.mockResolvedValue({ id: 'vs-1', state: VerificationSessionState.RequestCreated })
    const complete = await request(app).get(`${interactionPath}/complete`).set('Cookie', jar.header()).expect(303)
    jar.store(complete)
    const callbackUrl = await followTo(jar, complete.headers.location)
    expect(callbackUrl.searchParams.get('error')).toBe('access_denied')
    expect(callbackUrl.searchParams.get('code')).toBeNull()
  })

  test('status without the interaction cookie is rejected — no session leakage', async () => {
    const response = await request(app).get('/interaction/some-uid/status').expect(400)
    expect(response.body.status).toBe('error')
  })

  test('a failed session-creation call fails the flow cleanly (server_error)', async () => {
    sessionsMock.createSignedRequest.mockRejectedValue(new Error('identity-service down'))
    const codeVerifier = randomBytes(32).toString('base64url')
    const { jar, interactionPath } = await startFlow(codeVerifier)

    const response = await request(app).get(interactionPath).set('Cookie', jar.header()).expect(303)
    jar.store(response)
    const callbackUrl = await followTo(jar, response.headers.location)
    expect(callbackUrl.searchParams.get('error')).toBe('server_error')
  })
})
