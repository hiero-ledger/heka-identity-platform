import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import tokenIntrospectionConfig, { knownIntrospectionDevSecret } from 'config/token-introspection'

const ENV_KEYS = [
  'NODE_ENV',
  'OIDC_INTROSPECTION_ENABLED',
  'OIDC_INTROSPECTION_URL',
  'OIDC_INTROSPECTION_CLIENT_ID',
  'OIDC_INTROSPECTION_CLIENT_SECRET',
  'OIDC_INTROSPECTION_CLIENT_AUTH_METHOD',
  'OIDC_INTROSPECTION_TIMEOUT_MS',
  'OIDC_ISSUER_URL',
]

const enabledEnv = () => {
  process.env.OIDC_INTROSPECTION_ENABLED = 'true'
  process.env.OIDC_INTROSPECTION_CLIENT_ID = 'heka-identity-service'
  process.env.OIDC_INTROSPECTION_CLIENT_SECRET = 'a-secret-long-enough-for-production'
}

describe('token introspection config', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    for (const key of ENV_KEYS) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('is disabled with defaults when nothing is configured', () => {
    expect(tokenIntrospectionConfig()).toEqual({
      enabled: false,
      url: undefined,
      clientId: undefined,
      clientSecret: undefined,
      clientAuthMethod: 'client_secret_basic',
      timeoutMs: 3000,
      requireHttps: false,
    })
  })

  it('is enabled with client credentials and takes the endpoint from discovery by default', () => {
    enabledEnv()

    const config = tokenIntrospectionConfig()

    expect(config.enabled).toBe(true)
    expect(config.url).toBeUndefined()
    expect(config.clientId).toBe('heka-identity-service')
  })

  it('reads the endpoint, client auth method and timeout', () => {
    enabledEnv()
    process.env.OIDC_INTROSPECTION_URL = 'https://idp.example.com/introspect'
    process.env.OIDC_INTROSPECTION_CLIENT_AUTH_METHOD = 'client_secret_post'
    process.env.OIDC_INTROSPECTION_TIMEOUT_MS = '1500'

    const config = tokenIntrospectionConfig()

    expect(config.url).toBe('https://idp.example.com/introspect')
    expect(config.clientAuthMethod).toBe('client_secret_post')
    expect(config.timeoutMs).toBe(1500)
  })

  it.each(['TRUE', 'True', ' true '])('accepts %j as enabled', (value) => {
    enabledEnv()
    process.env.OIDC_INTROSPECTION_ENABLED = value

    expect(tokenIntrospectionConfig().enabled).toBe(true)
  })

  it.each(['false', 'FALSE', ''])('accepts %j as disabled', (value) => {
    process.env.OIDC_INTROSPECTION_ENABLED = value

    expect(tokenIntrospectionConfig().enabled).toBe(false)
  })

  it.each(['1', 'yes', 'on', 'enabled'])('refuses to start with an unrecognised value %j', (value) => {
    process.env.OIDC_INTROSPECTION_ENABLED = value

    expect(() => tokenIntrospectionConfig()).toThrow('OIDC_INTROSPECTION_ENABLED must be true or false')
  })

  it.each([
    ['OIDC_INTROSPECTION_CLIENT_ID', 'OIDC_INTROSPECTION_CLIENT_ID and OIDC_INTROSPECTION_CLIENT_SECRET'],
    ['OIDC_INTROSPECTION_CLIENT_SECRET', 'OIDC_INTROSPECTION_CLIENT_ID and OIDC_INTROSPECTION_CLIENT_SECRET'],
  ])('refuses to start when enabled without %s', (key, message) => {
    enabledEnv()
    delete process.env[key]

    expect(() => tokenIntrospectionConfig()).toThrow(message)
  })

  it.each([
    ['OIDC_INTROSPECTION_URL', 'ftp://idp.example.com/introspect', 'must be an http(s) URL'],
    ['OIDC_INTROSPECTION_URL', 'http://', 'must be an http(s) URL'],
    ['OIDC_INTROSPECTION_URL', 'https://idp example.com/introspect', 'must be an http(s) URL'],
    [
      'OIDC_INTROSPECTION_CLIENT_AUTH_METHOD',
      'private_key_jwt',
      'must be one of client_secret_basic, client_secret_post',
    ],
    ['OIDC_INTROSPECTION_TIMEOUT_MS', '0', 'must be a positive integer'],
    ['OIDC_INTROSPECTION_TIMEOUT_MS', 'soon', 'must be a positive integer'],
  ])('rejects an invalid %s (%s)', (key, value, message) => {
    enabledEnv()
    process.env[key] = value

    expect(() => tokenIntrospectionConfig()).toThrow(message)
  })

  it('refuses the shipped dev secret in production', () => {
    enabledEnv()
    process.env.NODE_ENV = 'production'
    process.env.OIDC_INTROSPECTION_CLIENT_SECRET = knownIntrospectionDevSecret

    expect(() => tokenIntrospectionConfig()).toThrow('dev secret from the shipped Keycloak realm')
  })

  it('requires https for the introspection endpoint in production', () => {
    enabledEnv()
    process.env.NODE_ENV = 'production'
    process.env.OIDC_INTROSPECTION_URL = 'http://idp.example.com/introspect'

    expect(() => tokenIntrospectionConfig()).toThrow('OIDC_INTROSPECTION_URL must use HTTPS in production')
  })

  it('requires https for discovery in production and accepts an https endpoint', () => {
    enabledEnv()
    process.env.NODE_ENV = 'production'
    process.env.OIDC_INTROSPECTION_URL = 'https://idp.example.com/introspect'

    expect(tokenIntrospectionConfig()).toMatchObject({ url: 'https://idp.example.com/introspect', requireHttps: true })
  })

  it('requires an https issuer in production when the endpoint is discovered', () => {
    enabledEnv()
    process.env.NODE_ENV = 'production'
    process.env.OIDC_ISSUER_URL = 'http://idp.example.com/realms/heka'

    expect(() => tokenIntrospectionConfig()).toThrow(
      'OIDC_ISSUER_URL must use HTTPS in production when the introspection endpoint is discovered',
    )

    process.env.OIDC_ISSUER_URL = 'HTTPS://idp.example.com/realms/heka'
    expect(tokenIntrospectionConfig().requireHttps).toBe(true)
  })

  it.each(['staging', 'prod', ' Production '])('treats NODE_ENV=%s as production', (nodeEnv) => {
    enabledEnv()
    process.env.NODE_ENV = nodeEnv
    process.env.OIDC_INTROSPECTION_URL = 'http://idp.example.com/introspect'

    expect(() => tokenIntrospectionConfig()).toThrow('OIDC_INTROSPECTION_URL must use HTTPS in production')
  })

  it.each(['development', 'test', ''])('treats NODE_ENV=%j as non-production', (nodeEnv) => {
    enabledEnv()
    process.env.NODE_ENV = nodeEnv
    process.env.OIDC_INTROSPECTION_URL = 'http://localhost:8080/introspect'

    expect(tokenIntrospectionConfig().requireHttps).toBe(false)
  })

  it('accepts an upper-case HTTPS endpoint in production', () => {
    enabledEnv()
    process.env.NODE_ENV = 'production'
    process.env.OIDC_INTROSPECTION_URL = 'HTTPS://idp.example.com/introspect'

    expect(tokenIntrospectionConfig().url).toBe('HTTPS://idp.example.com/introspect')
  })

  it('accepts an http endpoint outside production', () => {
    enabledEnv()
    process.env.OIDC_INTROSPECTION_URL = 'http://localhost:8080/introspect'

    expect(tokenIntrospectionConfig()).toMatchObject({ url: 'http://localhost:8080/introspect', requireHttps: false })
  })

  it('refuses a short secret in production', () => {
    enabledEnv()
    process.env.NODE_ENV = 'production'
    process.env.OIDC_INTROSPECTION_CLIENT_SECRET = 'short'

    expect(() => tokenIntrospectionConfig()).toThrow('too short for production')
  })

  it('accepts the dev secret outside production', () => {
    enabledEnv()
    process.env.OIDC_INTROSPECTION_CLIENT_SECRET = knownIntrospectionDevSecret

    expect(tokenIntrospectionConfig().clientSecret).toBe(knownIntrospectionDevSecret)
  })
})
