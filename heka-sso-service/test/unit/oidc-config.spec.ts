import { generateKeyPairSync } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
    expect(config.clockTolerance).toBe(15)
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
      OIDC_CLOCK_TOLERANCE: '30',
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
          dcqlQuery: { credentials: [{ id: 'pid', format: 'dc+sd-jwt', claims: [{ path: ['given_name'] }] }] },
          claimMapping: { 'pid.given_name': 'given_name' },
        },
      ]),
    })

    expect(config.cookieKeys).toEqual(['first-cookie-key-value', 'second-cookie-key-value'])
    expect(config.identityService.authToken).toBe('token-value')
    expect(config.ttl.accessToken).toBe(600)
    expect(config.clockTolerance).toBe(30)

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
    expect(config.loginConfigs[0].branding).toBeUndefined()
  })

  test('login-config branding: parsed when present, validated', () => {
    const config = new OidcConfig({
      OIDC_LOGIN_CONFIGS: JSON.stringify([
        {
          id: 'branded',
          verificationTemplate: 'pid-template',
          dcqlQuery: { credentials: [{ id: 'pid', format: 'dc+sd-jwt', claims: [{ path: ['given_name'] }] }] },
          claimMapping: {},
          branding: {
            productName: 'Acme ID',
            logoUrl: '/interaction/assets/acme.svg',
            colors: { 'brand-primary': '#123456', '--brand-page-background': '#fafafa' },
            customCss: '.card { border-top: 4px solid #123456; }',
          },
        },
      ]),
    })

    expect(config.loginConfigs[0].branding).toMatchObject({
      productName: 'Acme ID',
      logoUrl: '/interaction/assets/acme.svg',
      colors: { 'brand-primary': '#123456', '--brand-page-background': '#fafafa' },
      customCss: '.card { border-top: 4px solid #123456; }',
    })

    // malformed branding is rejected by validation
    expect(() =>
      validate({
        OIDC_LOGIN_CONFIGS: JSON.stringify([{ id: 'bad', verificationTemplate: 't', claimMapping: {}, branding: { productName: 42 } }]),
      })
    ).toThrow()
  })

  test('rejects malformed configuration in any environment', () => {
    expect(() => validate({ OIDC_ISSUER_URL: 'not-a-url' })).toThrow()
    expect(() => new OidcConfig({ OIDC_CLIENTS: 'not-json' })).toThrow(/invalid JSON/)
    expect(() => new OidcConfig({ OIDC_LOGIN_CONFIGS: '{"not":"an array"}' })).toThrow(/JSON array/)
    expect(() =>
      validate({
        OIDC_LOGIN_CONFIGS: JSON.stringify([{ id: 'x', verificationTemplate: 't', subStrategy: 'unknown' }]),
      })
    ).toThrow()
    expect(() =>
      validate({
        OIDC_CLIENTS: JSON.stringify([{ clientId: 'no-redirects', clientSecret: 'secret-value-long-enough' }]),
      })
    ).toThrow()
  })

  describe('static clients and login configs from files', () => {
    const client = {
      clientId: 'file-broker',
      clientSecret: 'file-secret-value-long-enough',
      redirectUris: ['https://idp.example.com/callback'],
      loginConfigId: 'default',
    }
    const loginConfig = {
      id: 'from-file',
      verificationTemplate: 'default',
      dcqlQuery: {
        credentials: [{ id: 'pid', format: 'dc+sd-jwt', meta: { vct_values: ['urn:eudi:pid:1'] }, claims: [{ path: ['given_name'] }] }],
      },
      claimMapping: { 'pid.given_name': 'given_name' },
      subStrategy: 'derived',
    }

    const withTempFile = (name: string, content: string, run: (file: string) => void) => {
      const file = join(tmpdir(), `${name}-${process.pid}-${Date.now()}.json`)
      writeFileSync(file, content)
      try {
        run(file)
      } finally {
        rmSync(file)
      }
    }

    test('are read from OIDC_CLIENTS_FILE and OIDC_LOGIN_CONFIGS_FILE when the inline variables are unset', () => {
      withTempFile('clients', JSON.stringify([client]), (clientsFile) => {
        withTempFile('login-configs', JSON.stringify([loginConfig]), (loginConfigsFile) => {
          const config = validate({ OIDC_CLIENTS_FILE: clientsFile, OIDC_LOGIN_CONFIGS_FILE: loginConfigsFile }).oidc
          expect(config.clients.map((c) => c.clientId)).toEqual(['file-broker'])
          expect(config.loginConfigs.map((c) => c.id)).toEqual(['from-file'])
        })
      })
    })

    test('inline variables take precedence over the files', () => {
      withTempFile('clients', JSON.stringify([client]), (clientsFile) => {
        const config = new OidcConfig({
          OIDC_CLIENTS: JSON.stringify([{ ...client, clientId: 'inline-broker' }]),
          OIDC_CLIENTS_FILE: clientsFile,
        })
        expect(config.clients.map((c) => c.clientId)).toEqual(['inline-broker'])
      })
    })

    test('a missing or malformed file is reported under the _FILE variable name', () => {
      const missing = join(tmpdir(), `missing-${process.pid}-${Date.now()}.json`)
      expect(() => new OidcConfig({ OIDC_CLIENTS_FILE: missing })).toThrow(/OIDC_CLIENTS_FILE could not be read/)
      expect(() => new OidcConfig({ OIDC_LOGIN_CONFIGS_FILE: missing })).toThrow(/OIDC_LOGIN_CONFIGS_FILE could not be read/)

      withTempFile('bad-clients', 'not-json', (file) => {
        expect(() => new OidcConfig({ OIDC_CLIENTS_FILE: file })).toThrow(/OIDC_CLIENTS_FILE contains invalid JSON/)
      })
      withTempFile('bad-login-configs', '{"not":"an array"}', (file) => {
        expect(() => new OidcConfig({ OIDC_LOGIN_CONFIGS_FILE: file })).toThrow(/OIDC_LOGIN_CONFIGS_FILE must be a JSON array/)
      })
    })
  })

  describe('login configuration DCQL / claim-mapping consistency', () => {
    const loginConfig = (overrides: Record<string, unknown>) => ({
      OIDC_LOGIN_CONFIGS: JSON.stringify([
        {
          id: 'default',
          verificationTemplate: 't',
          dcqlQuery: { credentials: [{ id: 'pid', format: 'dc+sd-jwt', claims: [{ path: ['given_name'] }] }] },
          claimMapping: { 'pid.given_name': 'given_name' },
          ...overrides,
        },
      ]),
    })

    test('accepts a mapping written against the DCQL credential query ids', () => {
      const config = new OidcConfig(
        loginConfig({
          dcqlQuery: { credentials: [{ id: 'pid' }, { id: 'mdl-1' }] },
          claimMapping: { 'pid.given_name': 'given_name', 'mdl-1.portrait': 'picture' },
        })
      )
      expect(config.loginConfigs[0].credentialQueryIds).toEqual(['pid', 'mdl-1'])
      expect(config.loginConfigs[0].dcqlProblems()).toEqual([])
    })

    test('rejects a login configuration without a dcqlQuery', () => {
      expect(() => new OidcConfig(loginConfig({ dcqlQuery: undefined, claimMapping: { 'pid.given_name': 'x' } }))).toThrow(
        /dcqlQuery is required/
      )
    })

    test('rejects a dcqlQuery without credential queries', () => {
      expect(() => new OidcConfig(loginConfig({ dcqlQuery: {} }))).toThrow(/credentials must be a non-empty array/)
      expect(() => new OidcConfig(loginConfig({ dcqlQuery: { credentials: [] } }))).toThrow(/credentials must be a non-empty array/)
    })

    test('rejects credential queries with a missing, malformed, or duplicate id', () => {
      expect(() => new OidcConfig(loginConfig({ dcqlQuery: { credentials: [{ format: 'dc+sd-jwt' }] } }))).toThrow(
        /credentials\[0\]\.id must be a non-empty string/
      )
      expect(() => new OidcConfig(loginConfig({ dcqlQuery: { credentials: [{ id: 'pid card' }] } }))).toThrow(
        /credentials\[0\]\.id must be a non-empty string/
      )
      expect(() => new OidcConfig(loginConfig({ dcqlQuery: { credentials: [{ id: 'pid' }, { id: 'pid' }] } }))).toThrow(
        /ids must be unique \(duplicate: pid\)/
      )
    })

    test('rejects claim-mapping keys that do not use a credential query id as prefix', () => {
      expect(() => new OidcConfig(loginConfig({ claimMapping: { 'PID.given_name': 'given_name' } }))).toThrow(
        /claimMapping key 'PID\.given_name' must be '<credential query id>\.<claim>' with an id from dcqlQuery \(pid\)/
      )
      expect(() => new OidcConfig(loginConfig({ claimMapping: { given_name: 'given_name' } }))).toThrow(/claimMapping key 'given_name'/)
      expect(() => new OidcConfig(loginConfig({ claimMapping: { 'pid.': 'given_name' } }))).toThrow(/claimMapping key 'pid\.'/)
      // the message names the offending login configuration
      expect(() => new OidcConfig(loginConfig({ claimMapping: { 'x.y': 'z' } }))).toThrow(
        /OIDC_LOGIN_CONFIGS: login configuration 'default': claimMapping key 'x\.y'/
      )
    })
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
        })
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
        })
    ).toThrow(/known default secret/)
  })

  test('stub login: off by default, on with OIDC_STUB_LOGIN=true, refused in production', () => {
    expect(new OidcConfig({}).stubLogin).toBe(false)
    expect(new OidcConfig({ OIDC_STUB_LOGIN: 'true' }).stubLogin).toBe(true)

    expect(() => new OidcConfig({ ...strongProductionEnv, OIDC_STUB_LOGIN: 'true' })).toThrow(
      /OIDC_STUB_LOGIN must not be enabled in production/
    )
    expect(new OidcConfig({ ...strongProductionEnv, OIDC_STUB_LOGIN: 'false' }).stubLogin).toBe(false)
  })

  describe('identity-service client credentials', () => {
    const clientCredentials = {
      IDENTITY_SERVICE_TOKEN_URL: 'https://idp.example.com/oauth/token',
      IDENTITY_SERVICE_CLIENT_ID: 'heka-sso-service',
      IDENTITY_SERVICE_CLIENT_SECRET: 'service-account-secret',
    }

    test('reads the token endpoint, client, auth method and extra token params', () => {
      const config = new OidcConfig({
        ...clientCredentials,
        IDENTITY_SERVICE_TOKEN_PARAMS: JSON.stringify({ audience: 'https://heka-identity', scope: 'openid' }),
      })

      expect(config.identityService).toMatchObject({
        tokenUrl: 'https://idp.example.com/oauth/token',
        clientId: 'heka-sso-service',
        clientSecret: 'service-account-secret',
        clientAuthMethod: 'client_secret_post',
        tokenParams: { audience: 'https://heka-identity', scope: 'openid' },
      })
      expect(config.identityService.usesClientCredentials).toBe(true)

      expect(
        new OidcConfig({ ...clientCredentials, IDENTITY_SERVICE_CLIENT_AUTH_METHOD: 'client_secret_basic' }).identityService
          .clientAuthMethod
      ).toBe('client_secret_basic')
      expect(new OidcConfig({}).identityService.usesClientCredentials).toBe(false)
      expect(new OidcConfig({}).identityService.tokenParams).toEqual({})
      // a static token takes precedence over configured client credentials
      expect(new OidcConfig({ ...clientCredentials, IDENTITY_SERVICE_AUTH_TOKEN: 'static' }).identityService.usesClientCredentials).toBe(
        false
      )
    })

    test('rejects partial or malformed settings in any environment', () => {
      expect(() => new OidcConfig({ IDENTITY_SERVICE_TOKEN_URL: 'https://idp.example.com/oauth/token' })).toThrow(
        /must be set together \(missing: IDENTITY_SERVICE_CLIENT_ID, IDENTITY_SERVICE_CLIENT_SECRET\)/
      )
      expect(() => new OidcConfig({ ...clientCredentials, IDENTITY_SERVICE_CLIENT_AUTH_METHOD: 'private_key_jwt' })).toThrow(
        /IDENTITY_SERVICE_CLIENT_AUTH_METHOD must be one of/
      )
      expect(() => new OidcConfig({ ...clientCredentials, IDENTITY_SERVICE_TOKEN_PARAMS: 'not-json' })).toThrow(/invalid JSON/)
      expect(() => new OidcConfig({ ...clientCredentials, IDENTITY_SERVICE_TOKEN_PARAMS: '["audience"]' })).toThrow(/JSON object/)
      expect(() => new OidcConfig({ ...clientCredentials, IDENTITY_SERVICE_TOKEN_PARAMS: '{"audience":{"x":1}}' })).toThrow(
        /value of 'audience' must be a string/
      )
    })

    test('in production: refuses the dev client secret and short secrets', () => {
      expect(
        () =>
          new OidcConfig({
            ...strongProductionEnv,
            ...clientCredentials,
            IDENTITY_SERVICE_CLIENT_SECRET: 'dev-only-heka-sso-service-secret-do-not-use-in-production',
          })
      ).toThrow(/known default secret/)

      expect(() => new OidcConfig({ ...strongProductionEnv, ...clientCredentials, IDENTITY_SERVICE_CLIENT_SECRET: 'short' })).toThrow(
        /IDENTITY_SERVICE_CLIENT_SECRET is too short for production/
      )

      const config = new OidcConfig({
        ...strongProductionEnv,
        ...clientCredentials,
        IDENTITY_SERVICE_CLIENT_SECRET: 'strong-production-client-secret',
      })
      expect(config.identityService.usesClientCredentials).toBe(true)
    })
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
        })
    ).toThrow(/too short for production/)
  })

  test('accepts a fully specified production configuration', () => {
    const config = validate(strongProductionEnv)

    expect(config.oidc.issuerUrl).toBe('https://sso.example.com')
    expect(config.oidc.cookieKeys).toHaveLength(2)
  })

  describe('signing JWKS override', () => {
    const strongRsaJwk = (): Record<string, any> => {
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
      return { ...(privateKey.export({ format: 'jwk' }) as Record<string, any>), kid: 'prod-key-1', alg: 'RS256' }
    }

    test('is undefined by default and parsed from OIDC_JWKS when set', () => {
      expect(new OidcConfig({}).jwks).toBeUndefined()

      const config = new OidcConfig({ OIDC_JWKS: JSON.stringify({ keys: [{ kty: 'RSA', kid: 'dev-key' }] }) })
      expect(config.jwks?.keys[0].kid).toBe('dev-key')
    })

    test('is read from OIDC_JWKS_FILE when set', () => {
      const file = join(tmpdir(), `jwks-${Date.now()}.json`)
      writeFileSync(file, JSON.stringify({ keys: [{ kty: 'RSA', kid: 'file-key' }] }))
      try {
        expect(new OidcConfig({ OIDC_JWKS_FILE: file }).jwks?.keys[0].kid).toBe('file-key')
      } finally {
        rmSync(file)
      }
      expect(() => new OidcConfig({ OIDC_JWKS_FILE: file })).toThrow(/could not be read/)
    })

    test('rejects malformed overrides in any environment', () => {
      expect(() => new OidcConfig({ OIDC_JWKS: 'not-json' })).toThrow(/invalid JSON/)
      expect(() => new OidcConfig({ OIDC_JWKS: '{"keys":[]}' })).toThrow(/non-empty "keys" array/)
    })

    test('refuses known-default, public-only, and weak keys in production', () => {
      const jwks = (keys: Record<string, any>[]) => ({
        ...strongProductionEnv,
        OIDC_JWKS: JSON.stringify({ keys }),
      })

      expect(() => new OidcConfig(jwks([{ ...strongRsaJwk(), kid: 'keystore-CHANGE-ME' }]))).toThrow(/known default key/)
      const publicOnly = strongRsaJwk()
      delete publicOnly.d
      expect(() => new OidcConfig(jwks([publicOnly]))).toThrow(/no private material/)
      expect(() => new OidcConfig(jwks([{ ...strongRsaJwk(), n: Buffer.alloc(128).toString('base64url') }]))).toThrow(/below 2048 bits/)
      expect(() => new OidcConfig(jwks([{ kty: 'EC', crv: 'secp256k1', kid: 'k', d: 'x', x: 'x', y: 'y' }]))).toThrow(
        /unsupported EC curve/
      )

      expect(new OidcConfig(jwks([strongRsaJwk()])).jwks?.keys).toHaveLength(1)
    })
  })
})
