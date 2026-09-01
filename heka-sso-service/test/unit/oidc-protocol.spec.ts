import { createHash, randomBytes } from 'node:crypto'

import request from 'supertest'

import { OidcConfig } from '../../src/core/config'
import { createOidcProvider } from '../../src/oidc'
import { testJwks } from '../helpers/jwks'

/**
 * OP core PR 2 protocol policy (INTEGRATION.md Phase 1): static clients from
 * `OIDC_CLIENTS`, authorization code + PKCE (S256) only, client_secret_basic +
 * client_secret_post. Only the validation/error paths are testable here — the
 * happy-path code exchange needs the adapter, interaction, and findAccount PRs.
 */
describe('OIDC protocol policy', () => {
  const brokerRedirectUri = 'https://kc.example.com/realms/r/broker/heka-sso/endpoint'
  const postClientRedirectUri = 'https://rp.example.com/callback'
  const brokerSecret = 'broker-secret-value-long-enough'

  const config = new OidcConfig({
    OIDC_CLIENTS: JSON.stringify([
      {
        clientId: 'keycloak-broker',
        clientSecret: brokerSecret,
        redirectUris: [brokerRedirectUri],
        loginConfigId: 'default',
      },
      {
        clientId: 'post-client',
        clientSecret: 'post-secret-value-long-enough',
        redirectUris: [postClientRedirectUri],
        tokenEndpointAuthMethod: 'client_secret_post',
      },
    ]),
  })
  const provider = createOidcProvider(config, testJwks())
  const callback = provider.callback()

  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')

  const validAuthorizeQuery = {
    client_id: 'keycloak-broker',
    redirect_uri: brokerRedirectUri,
    response_type: 'code',
    scope: 'openid',
    state: 'state-echoed-verbatim',
    nonce: 'nonce-value',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }

  const redirectError = (location: string) => {
    const url = new URL(location)
    // response_type=code errors come back in the query; implicit-style in the fragment
    const params = new URLSearchParams(url.hash ? url.hash.slice(1) : url.search)
    return Object.fromEntries(params.entries())
  }

  test('registers the static clients with their login config reference', async () => {
    const broker = await provider.Client.find('keycloak-broker')
    expect(broker).toBeDefined()
    expect(broker!.metadata()).toMatchObject({
      client_id: 'keycloak-broker',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      redirect_uris: [brokerRedirectUri],
      token_endpoint_auth_method: 'client_secret_basic',
      login_config_id: 'default',
    })

    const postClient = await provider.Client.find('post-client')
    expect(postClient!.metadata().token_endpoint_auth_method).toBe('client_secret_post')
    expect(postClient!.metadata().login_config_id).toBeUndefined()
  })

  test('advertises the protocol policy in discovery', async () => {
    const response = await request(callback).get('/.well-known/openid-configuration').expect(200)

    expect(response.body.response_types_supported).toEqual(['code'])
    expect(response.body.grant_types_supported).toContain('authorization_code')
    expect(response.body.code_challenge_methods_supported).toEqual(['S256'])
    expect(response.body.token_endpoint_auth_methods_supported.sort()).toEqual([
      'client_secret_basic',
      'client_secret_post',
    ])
  })

  describe('/authorize validation', () => {
    test('rejects an unknown client on the error page — never a redirect', async () => {
      const response = await request(callback)
        .get('/authorize')
        .query({ ...validAuthorizeQuery, client_id: 'unknown-client' })

      expect(response.status).toBe(400)
      expect(response.headers.location).toBeUndefined()
      expect(response.text).toContain('Sign-in error')
      expect(response.text).toContain('invalid_client')
    })

    test('rejects an unregistered redirect_uri on the error page — never a redirect', async () => {
      const response = await request(callback)
        .get('/authorize')
        .query({ ...validAuthorizeQuery, redirect_uri: 'https://attacker.example.com/callback' })

      expect(response.status).toBe(400)
      expect(response.headers.location).toBeUndefined()
      expect(response.text).toContain('Sign-in error')
    })

    test('accepts a missing PKCE challenge (requirement relaxed for Keycloak broker defaults)', async () => {
      // pkce.required was relaxed to `() => false` (commit e7ef715): Keycloak's
      // identity-provider config does not send PKCE unless explicitly enabled.
      // Revisit once the demo realm (P1.7) pins PKCE S256 on the IdP side.
      const withoutPkce: Partial<typeof validAuthorizeQuery> = { ...validAuthorizeQuery }
      delete withoutPkce.code_challenge
      delete withoutPkce.code_challenge_method
      const response = await request(callback).get('/authorize').query(withoutPkce).expect(303)

      expect(response.headers.location).toMatch(/\/interaction\/[^/]+$/)
    })

    test('rejects the plain code_challenge_method — S256 only', async () => {
      const response = await request(callback)
        .get('/authorize')
        .query({ ...validAuthorizeQuery, code_challenge: codeVerifier, code_challenge_method: 'plain' })
        .expect(303)

      const error = redirectError(response.headers.location)
      expect(error.error).toBe('invalid_request')
      expect(error.error_description).toContain('code_challenge_method')
    })

    test('rejects response types other than code', async () => {
      const response = await request(callback)
        .get('/authorize')
        .query({ ...validAuthorizeQuery, response_type: 'id_token' })
        .expect(303)

      expect(redirectError(response.headers.location).error).toBe('unsupported_response_type')
    })

    test('routes a valid request toward the interaction', async () => {
      const response = await request(callback).get('/authorize').query(validAuthorizeQuery).expect(303)

      expect(response.headers.location).toMatch(/\/interaction\/[^/]+$/)
      const cookies: string[] = ([] as string[]).concat(response.headers['set-cookie'] ?? [])
      expect(cookies.some((cookie) => cookie.startsWith('_interaction'))).toBe(true)
    })
  })

  describe('/token client authentication and validation', () => {
    test('rejects a wrong client secret (client_secret_basic)', async () => {
      const response = await request(callback)
        .post('/token')
        .auth('keycloak-broker', 'wrong-secret')
        .type('form')
        .send({ grant_type: 'authorization_code', code: 'bogus', redirect_uri: brokerRedirectUri })

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('invalid_client')
    })

    test('accepts header and body secret presentation interchangeably', async () => {
      // The library treats client_secret_basic/client_secret_post as one
      // secret-based family: a client registered with one may present its
      // (correct) secret via the other — exactly the Cognito/Entra floor.
      const response = await request(callback).post('/token').type('form').send({
        grant_type: 'authorization_code',
        client_id: 'keycloak-broker',
        client_secret: brokerSecret,
        code: 'bogus',
        code_verifier: codeVerifier,
        redirect_uri: brokerRedirectUri,
      })

      // Client auth passed; only the (nonexistent) code is rejected
      expect(response.status).toBe(400)
      expect(response.body.error).toBe('invalid_grant')
    })

    test('accepts client_secret_post for clients registered with it', async () => {
      const response = await request(callback).post('/token').type('form').send({
        grant_type: 'authorization_code',
        client_id: 'post-client',
        client_secret: 'post-secret-value-long-enough',
        code: 'bogus',
        code_verifier: codeVerifier,
        redirect_uri: postClientRedirectUri,
      })

      // Client auth passed; only the (nonexistent) code is rejected
      expect(response.status).toBe(400)
      expect(response.body.error).toBe('invalid_grant')
    })

    test('rejects grant types outside the protocol policy', async () => {
      const unsupported = await request(callback)
        .post('/token')
        .auth('keycloak-broker', brokerSecret)
        .type('form')
        .send({ grant_type: 'client_credentials' })
      expect(unsupported.status).toBe(400)
      expect(unsupported.body.error).toBe('unsupported_grant_type')

      const notAllowed = await request(callback)
        .post('/token')
        .auth('keycloak-broker', brokerSecret)
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: 'bogus' })
      expect(notAllowed.status).toBe(400)
      expect(notAllowed.body.error_description).toContain('grant type is not allowed for this client')
    })

    test('rejects an authorization_code request without a code', async () => {
      const response = await request(callback)
        .post('/token')
        .auth('keycloak-broker', brokerSecret)
        .type('form')
        .send({ grant_type: 'authorization_code', redirect_uri: brokerRedirectUri, code_verifier: codeVerifier })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('invalid_request')
    })

    test('rejects an unknown authorization code for an authenticated client', async () => {
      const response = await request(callback).post('/token').auth('keycloak-broker', brokerSecret).type('form').send({
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
