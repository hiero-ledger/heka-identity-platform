import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import tokenRevocationConfig from 'config/token-revocation'

describe('token revocation config', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    delete process.env.JWT_REVOCATION_CHECK_ENABLED
    delete process.env.JWT_REVOCATION_CHECK_URL
    delete process.env.JWT_REVOCATION_CHECK_TIMEOUT_MS
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('is disabled by default', () => {
    expect(tokenRevocationConfig()).toEqual({ enabled: false, url: undefined, timeoutMs: 3000 })
  })

  it('is disabled for any value other than "true"', () => {
    process.env.JWT_REVOCATION_CHECK_ENABLED = '1'
    expect(tokenRevocationConfig().enabled).toBe(false)
  })

  it('does not require a URL when disabled', () => {
    process.env.JWT_REVOCATION_CHECK_ENABLED = 'false'
    expect(() => tokenRevocationConfig()).not.toThrow()
  })

  it('reads URL and timeout when enabled', () => {
    process.env.JWT_REVOCATION_CHECK_ENABLED = 'true'
    process.env.JWT_REVOCATION_CHECK_URL = 'http://auth:3004/api/v1/oauth/introspect'
    process.env.JWT_REVOCATION_CHECK_TIMEOUT_MS = '1500'

    expect(tokenRevocationConfig()).toEqual({
      enabled: true,
      url: 'http://auth:3004/api/v1/oauth/introspect',
      timeoutMs: 1500,
    })
  })

  it.each(['0', '-1', 'abc'])('falls back to the default timeout for %s', (value) => {
    process.env.JWT_REVOCATION_CHECK_TIMEOUT_MS = value
    expect(tokenRevocationConfig().timeoutMs).toBe(3000)
  })

  it.each([undefined, ''])('fails when enabled without a URL (%s)', (value) => {
    process.env.JWT_REVOCATION_CHECK_ENABLED = 'true'
    if (value !== undefined) process.env.JWT_REVOCATION_CHECK_URL = value

    expect(() => tokenRevocationConfig()).toThrow(/JWT_REVOCATION_CHECK_URL/)
  })

  it.each(['not a url', 'ftp://auth/introspect'])('fails when enabled with an unusable URL (%s)', (value) => {
    process.env.JWT_REVOCATION_CHECK_ENABLED = 'true'
    process.env.JWT_REVOCATION_CHECK_URL = value

    expect(() => tokenRevocationConfig()).toThrow(/JWT_REVOCATION_CHECK_URL/)
  })
})
