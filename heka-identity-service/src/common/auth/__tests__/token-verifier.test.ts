import { createMock } from '@golevelup/ts-vitest'
import { UnauthorizedException } from '@nestjs/common'
import { exportJWK, generateKeyPair, JSONWebKeySet, SignJWT } from 'jose'

import { Logger } from 'common/logger'
import { OidcConfig, oidcClaimsDefaults } from 'config/oidc'

import { TokenVerifier } from '../token-verifier.service'

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>

const issuer = 'https://oidc.test.heka.local/realms/heka'
const audience = 'heka-identity-service'
const nowSeconds = () => Math.floor(Date.now() / 1000)

describe('TokenVerifier', () => {
  let trusted: KeyPair
  let untrusted: KeyPair
  let jwks: JSONWebKeySet

  beforeAll(async () => {
    trusted = await generateKeyPair('RS256', { extractable: true })
    untrusted = await generateKeyPair('RS256', { extractable: true })
    jwks = { keys: [{ ...(await exportJWK(trusted.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] }
  })

  const baseConfig = (): OidcConfig => ({
    issuerUrl: issuer,
    audience,
    jwks,
    algorithms: ['RS256'],
    clockTolerance: 15,
    claims: { ...oidcClaimsDefaults, name: [...oidcClaimsDefaults.name] },
  })

  const makeVerifier = (overrides: Partial<OidcConfig> = {}) =>
    new TokenVerifier({ ...baseConfig(), ...overrides }, createMock<Logger>())

  const contractClaims = { roles: ['Issuer'], name: 'Alice', org_id: 'org-1' }

  interface SignParams {
    iss?: string | null
    aud?: string | string[] | null
    exp?: number | string
    kid?: string
    key?: KeyPair['privateKey']
  }

  const sign = async (
    payload: Record<string, unknown>,
    { iss = issuer, aud = audience, exp = '1h', kid = 'k1', key = trusted.privateKey }: SignParams = {},
  ): Promise<string> => {
    const jwt = new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setSubject('user-1')
      .setExpirationTime(exp)
    if (iss !== null) jwt.setIssuer(iss)
    if (aud !== null) jwt.setAudience(aud)
    return jwt.sign(key)
  }

  describe('verify', () => {
    test('verifies a token and maps its claims', async () => {
      const token = await sign(contractClaims)

      await expect(makeVerifier().verify(token)).resolves.toEqual({
        sub: 'user-1',
        roles: ['Issuer'],
        name: 'Alice',
        org_id: 'org-1',
      })
    })

    test('accepts an aud array that contains the audience', async () => {
      const token = await sign(contractClaims, { aud: [audience, 'account'] })

      await expect(makeVerifier().verify(token)).resolves.toMatchObject({ sub: 'user-1' })
    })

    test('accepts a token that expired within the clock tolerance', async () => {
      const token = await sign(contractClaims, { exp: nowSeconds() - 5 })

      await expect(makeVerifier().verify(token)).resolves.toMatchObject({ sub: 'user-1' })
    })

    test.each<[string, SignParams & { untrustedKey?: boolean }]>([
      ['a wrong issuer', { iss: 'https://oidc.test.heka.local/realms/other' }],
      ['a missing issuer', { iss: null }],
      ['a wrong audience', { aud: 'heka-mobile-app' }],
      ['a missing audience', { aud: null }],
      ['an expired token', { exp: nowSeconds() - 60 }],
      ['an unknown key id', { kid: 'k2' }],
      ['a signature by an unknown key', { untrustedKey: true }],
    ])('rejects %s', async (_label, { untrustedKey, ...params }) => {
      const token = await sign(contractClaims, {
        ...params,
        ...(untrustedKey ? { key: untrusted.privateKey } : {}),
      })

      await expect(makeVerifier().verify(token)).rejects.toThrow(UnauthorizedException)
    })

    test('rejects a token signed with a shared secret (HS256)', async () => {
      const token = await new SignJWT(contractClaims)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setSubject('user-1')
        .setIssuer(issuer)
        .setAudience(audience)
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode('test'))

      await expect(makeVerifier().verify(token)).rejects.toThrow(UnauthorizedException)
    })

    test('rejects a verified token that violates the claim contract', async () => {
      const token = await sign({ ...contractClaims, roles: [] })

      await expect(makeVerifier().verify(token)).rejects.toThrow(UnauthorizedException)
    })

    test('applies the configured claim paths', async () => {
      const token = await sign(
        {
          'https://heka/roles': ['Verifier'],
          'https://heka/name': 'bob',
          'https://heka/org_id': 'org-2',
          'https://heka/heka_uid': 'legacy-uuid',
        },
        { aud: ['https://heka-identity', `${issuer}/userinfo`] },
      )
      const verifier = makeVerifier({
        audience: 'https://heka-identity',
        claims: {
          userId: 'https://heka/heka_uid',
          roles: 'https://heka/roles',
          name: ['https://heka/name', 'name'],
          orgId: 'https://heka/org_id',
        },
      })

      await expect(verifier.verify(token)).resolves.toEqual({
        sub: 'legacy-uuid',
        roles: ['Verifier'],
        name: 'bob',
        org_id: 'org-2',
      })
    })

    test('exposes the raw payload through verifyJwt', async () => {
      const token = await sign({ ...contractClaims, extra: 'kept' })

      await expect(makeVerifier().verifyJwt(token)).resolves.toMatchObject({ sub: 'user-1', extra: 'kept' })
    })
  })

  describe('configuration', () => {
    test('requires an issuer', () => {
      expect(() => makeVerifier({ issuerUrl: undefined })).toThrow('OIDC_ISSUER_URL')
    })

    test('requires an audience', () => {
      expect(() => makeVerifier({ audience: undefined })).toThrow('OIDC_AUDIENCE')
    })

    test('refuses HMAC algorithms', () => {
      expect(() => makeVerifier({ algorithms: ['RS256', 'HS256'] })).toThrow('HMAC')
    })
  })

  describe('discovery', () => {
    const discoveryUrl = `${issuer}/.well-known/openid-configuration`
    const jwksUri = `${issuer}/protocol/openid-connect/certs`

    const jsonResponse = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    test('resolves the JWKS through the discovery document once', async () => {
      const fetchMock = vi.fn((input: string | URL) => {
        const url = String(input)
        if (url === discoveryUrl) return Promise.resolve(jsonResponse({ issuer, jwks_uri: jwksUri }))
        if (url === jwksUri) return Promise.resolve(jsonResponse(jwks))
        return Promise.reject(new Error(`Unexpected fetch: ${url}`))
      })
      vi.stubGlobal('fetch', fetchMock)

      const verifier = makeVerifier({ jwks: undefined })
      const token = await sign(contractClaims)

      await expect(verifier.verify(token)).resolves.toMatchObject({ sub: 'user-1' })
      await expect(verifier.verify(token)).resolves.toMatchObject({ sub: 'user-1' })

      const discoveryCalls = fetchMock.mock.calls.filter(([input]) => String(input) === discoveryUrl)
      expect(discoveryCalls).toHaveLength(1)
    })

    test('uses OIDC_JWKS_URI without discovery', async () => {
      const fetchMock = vi.fn((input: string | URL) => {
        if (String(input) === jwksUri) return Promise.resolve(jsonResponse(jwks))
        return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`))
      })
      vi.stubGlobal('fetch', fetchMock)

      const verifier = makeVerifier({ jwks: undefined, jwksUri })
      const token = await sign(contractClaims)

      await expect(verifier.verify(token)).resolves.toMatchObject({ sub: 'user-1' })
      expect(fetchMock.mock.calls.some(([input]) => String(input) === discoveryUrl)).toBe(false)
    })

    test('reports a failed discovery as an error, not as unauthorized, and retries later', async () => {
      let discoveryAttempts = 0
      const fetchMock = vi.fn((input: string | URL) => {
        const url = String(input)
        if (url === discoveryUrl) {
          discoveryAttempts += 1
          return Promise.resolve(
            discoveryAttempts === 1
              ? jsonResponse({ error: 'unavailable' }, 503)
              : jsonResponse({ issuer, jwks_uri: jwksUri }),
          )
        }
        if (url === jwksUri) return Promise.resolve(jsonResponse(jwks))
        return Promise.reject(new Error(`Unexpected fetch: ${url}`))
      })
      vi.stubGlobal('fetch', fetchMock)

      const verifier = makeVerifier({ jwks: undefined })
      const token = await sign(contractClaims)

      const firstAttempt = verifier.verify(token)
      await expect(firstAttempt).rejects.toThrow('OIDC discovery')
      await expect(firstAttempt).rejects.not.toThrow(UnauthorizedException)

      await expect(verifier.verify(token)).resolves.toMatchObject({ sub: 'user-1' })
      expect(discoveryAttempts).toBe(2)
    })
  })
})
