import { OidcConfig, SubStrategy, validate } from '../../src/core/config'

const strongProductionEnv = {
  NODE_ENV: 'production',
  OIDC_ISSUER_URL: 'https://sso.example.com',
  OIDC_COOKIE_KEYS: 'k'.repeat(32) + ',' + 'j'.repeat(32),
  OIDC_SUB_HMAC_SALT: 's'.repeat(48),
  IDENTITY_SERVICE_BASE_URL: 'https://identity.example.com',
}

describe('OidcConfig', () => {
  test('builds with defaults and generated dev secrets from an empty configuration', () => {
    const config = new OidcConfig({})

    expect(config.issuerUrl).toBe('http://localhost:3005')
    expect(config.identityService.baseUrl).toBe('http://localhost:3000')
    expect(config.identityService.authToken).toBeUndefined()

    // Secrets have no compiled-in defaults — outside production they are generated per boot
    expect(config.cookieKeys).toHaveLength(1)
    expect(config.cookieKeys[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(config.subHmacSalt).toMatch(/^[0-9a-f]{64}$/)
    expect(new OidcConfig({}).subHmacSalt).not.toBe(config.subHmacSalt)

    expect(config.ttl).toMatchObject({
      accessToken: 3600,
      authorizationCode: 60,
      idToken: 3600,
      interaction: 600,
      session: 86400,
      grant: 86400,
    })
    expect(config.clients).toEqual([])
    expect(config.loginConfigs).toEqual([])
  })

  test('reads values, static clients, and login configs from the configuration', () => {
    const config = new OidcConfig({
      OIDC_ISSUER_URL: 'https://sso.example.com',
      OIDC_COOKIE_KEYS: 'first-cookie-key-value,second-cookie-key-value',
      OIDC_SUB_HMAC_SALT: 'x'.repeat(32),
      IDENTITY_SERVICE_BASE_URL: 'http://identity.internal:3000',
      IDENTITY_SERVICE_AUTH_TOKEN: 'token-value',
      OIDC_TTL_ACCESS_TOKEN: '600',
      OIDC_CLIENTS: JSON.stringify([
        {
          clientId: 'keycloak-broker',
          clientSecret: 'broker-secret-value-long-enough',
          redirectUris: ['https://kc.example.com/realms/r/broker/heka-sso/endpoint'],
          loginConfigId: 'default',
        },
      ]),
      OIDC_LOGIN_CONFIGS: JSON.stringify([
        {
          id: 'default',
          verificationTemplate: 'pid-template',
          claimMapping: { 'pid.given_name': 'given_name' },
        },
      ]),
    })

    expect(config.cookieKeys).toEqual(['first-cookie-key-value', 'second-cookie-key-value'])
    expect(config.identityService.authToken).toBe('token-value')
    expect(config.ttl.accessToken).toBe(600)

    expect(config.clients).toHaveLength(1)
    expect(config.clients[0]).toMatchObject({
      clientId: 'keycloak-broker',
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      tokenEndpointAuthMethod: 'client_secret_basic',
      loginConfigId: 'default',
    })

    expect(config.loginConfigs).toHaveLength(1)
    expect(config.loginConfigs[0].subStrategy).toBe(SubStrategy.derived)
    expect(config.loginConfigs[0].issuerAllowlist).toEqual([])
  })

  test('rejects malformed configuration in any environment', () => {
    expect(() => validate({ OIDC_ISSUER_URL: 'not-a-url' })).toThrow()
    expect(() => new OidcConfig({ OIDC_CLIENTS: 'not-json' })).toThrow(/invalid JSON/)
    expect(() => new OidcConfig({ OIDC_LOGIN_CONFIGS: '{"not":"an array"}' })).toThrow(/JSON array/)
    expect(() =>
      validate({
        OIDC_LOGIN_CONFIGS: JSON.stringify([{ id: 'x', verificationTemplate: 't', subStrategy: 'unknown' }]),
      }),
    ).toThrow()
    expect(() =>
      validate({
        OIDC_CLIENTS: JSON.stringify([{ clientId: 'no-redirects', clientSecret: 'secret-value-long-enough' }]),
      }),
    ).toThrow()
  })

  test('fails fast in production when secrets are unset', () => {
    expect(() => new OidcConfig({ NODE_ENV: 'production' })).toThrow(/must be set in production/)
  })

  test('refuses known default secrets in production', () => {
    expect(
      () =>
        new OidcConfig({
          ...strongProductionEnv,
          OIDC_COOKIE_KEYS: 'dev-only-cookie-key-do-not-use-in-production',
        }),
    ).toThrow(/known default secret/)

    expect(
      () =>
        new OidcConfig({
          ...strongProductionEnv,
          OIDC_CLIENTS: JSON.stringify([
            {
              clientId: 'keycloak-broker',
              clientSecret: 'dev-only-broker-secret-do-not-use-in-production',
              redirectUris: ['https://kc.example.com/realms/r/broker/heka-sso/endpoint'],
            },
          ]),
        }),
    ).toThrow(/known default secret/)
  })

  test('rejects too-short client secrets in production', () => {
    expect(
      () =>
        new OidcConfig({
          ...strongProductionEnv,
          OIDC_CLIENTS: JSON.stringify([
            {
              clientId: 'keycloak-broker',
              clientSecret: 'short',
              redirectUris: ['https://kc.example.com/realms/r/broker/heka-sso/endpoint'],
            },
          ]),
        }),
    ).toThrow(/too short for production/)
  })

  test('accepts a fully specified production configuration', () => {
    const config = validate(strongProductionEnv)

    expect(config.oidc.issuerUrl).toBe('https://sso.example.com')
    expect(config.oidc.cookieKeys).toHaveLength(2)
  })
})
