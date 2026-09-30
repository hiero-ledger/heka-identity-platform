import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import demoConfig, { knownDemoDevSecret } from 'config/demo'

const DEMO_ENV_KEYS = [
  'NODE_ENV',
  'DEMO_TOKEN_URL',
  'DEMO_CLIENT_ID',
  'DEMO_CLIENT_SECRET',
  'DEMO_CLIENT_AUTH_METHOD',
  'DEMO_TOKEN_PARAMS',
  'DEMO_TOKEN_RATE_LIMIT',
]

const TOKEN_URL = 'http://localhost:8080/realms/heka-platform/protocol/openid-connect/token'

const enabledEnv = () => {
  process.env.DEMO_TOKEN_URL = TOKEN_URL
  process.env.DEMO_CLIENT_ID = 'heka-demo'
  process.env.DEMO_CLIENT_SECRET = 'a-secret-long-enough-for-production'
}

describe('demo config', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    for (const key of DEMO_ENV_KEYS) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('is disabled with defaults when nothing is configured', () => {
    const config = demoConfig()

    expect(config.enabled).toBe(false)
    expect(config.tokenUrl).toBeUndefined()
    expect(config.clientAuthMethod).toBe('client_secret_post')
    expect(config.tokenParams).toEqual({})
    expect(config.rateLimit).toBe(30)
  })

  it('is enabled when the token URL, client id and secret are all set', () => {
    enabledEnv()
    process.env.DEMO_CLIENT_AUTH_METHOD = 'client_secret_basic'
    process.env.DEMO_TOKEN_PARAMS = '{"audience":"https://heka-identity","scope":"openid"}'
    process.env.DEMO_TOKEN_RATE_LIMIT = '5'

    const config = demoConfig()

    expect(config.enabled).toBe(true)
    expect(config.tokenUrl).toBe(TOKEN_URL)
    expect(config.clientId).toBe('heka-demo')
    expect(config.clientSecret).toBe('a-secret-long-enough-for-production')
    expect(config.clientAuthMethod).toBe('client_secret_basic')
    expect(config.tokenParams).toEqual({ audience: 'https://heka-identity', scope: 'openid' })
    expect(config.rateLimit).toBe(5)
  })

  it('treats blank values as unset', () => {
    process.env.DEMO_TOKEN_URL = '  '
    process.env.DEMO_CLIENT_ID = ''
    process.env.DEMO_CLIENT_SECRET = ' '

    expect(demoConfig().enabled).toBe(false)
  })

  it('refuses a partial configuration', () => {
    process.env.DEMO_TOKEN_URL = TOKEN_URL
    process.env.DEMO_CLIENT_ID = 'heka-demo'

    expect(() => demoConfig()).toThrow(/must be set together \(missing: DEMO_CLIENT_SECRET\)/)
  })

  it('refuses a token URL that is not http(s)', () => {
    enabledEnv()
    process.env.DEMO_TOKEN_URL = 'localhost:8080/token'

    expect(() => demoConfig()).toThrow(/DEMO_TOKEN_URL must be an http\(s\) URL/)
  })

  it('refuses an unknown client authentication method', () => {
    enabledEnv()
    process.env.DEMO_CLIENT_AUTH_METHOD = 'private_key_jwt'

    expect(() => demoConfig()).toThrow(/DEMO_CLIENT_AUTH_METHOD must be one of/)
  })

  it('refuses malformed token params', () => {
    enabledEnv()
    process.env.DEMO_TOKEN_PARAMS = '{not json'
    expect(() => demoConfig()).toThrow(/DEMO_TOKEN_PARAMS contains invalid JSON/)

    process.env.DEMO_TOKEN_PARAMS = '["audience"]'
    expect(() => demoConfig()).toThrow(/must be a JSON object/)

    process.env.DEMO_TOKEN_PARAMS = '{"audience":{"nested":true}}'
    expect(() => demoConfig()).toThrow(/value of 'audience' must be a string/)
  })

  it('refuses a non-positive rate limit', () => {
    process.env.DEMO_TOKEN_RATE_LIMIT = '0'
    expect(() => demoConfig()).toThrow(/DEMO_TOKEN_RATE_LIMIT must be a positive integer/)

    process.env.DEMO_TOKEN_RATE_LIMIT = 'many'
    expect(() => demoConfig()).toThrow(/DEMO_TOKEN_RATE_LIMIT must be a positive integer/)
  })

  it('refuses the shipped dev secret and short secrets in production only', () => {
    enabledEnv()
    process.env.DEMO_CLIENT_SECRET = knownDemoDevSecret
    expect(demoConfig().enabled).toBe(true)

    process.env.NODE_ENV = 'production'
    expect(() => demoConfig()).toThrow(/DEMO_CLIENT_SECRET is the dev secret/)

    process.env.DEMO_CLIENT_SECRET = 'short'
    expect(() => demoConfig()).toThrow(/DEMO_CLIENT_SECRET is too short for production/)

    process.env.DEMO_CLIENT_SECRET = 'a-secret-long-enough-for-production'
    expect(demoConfig().enabled).toBe(true)
  })
})
