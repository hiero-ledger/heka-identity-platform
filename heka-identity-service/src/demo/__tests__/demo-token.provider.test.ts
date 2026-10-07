import { createMock } from '@golevelup/ts-vitest'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { Logger } from 'common/logger'
import { DemoConfig, demoConfigDefaults } from 'config/demo'

import { DemoTokenProvider } from '../demo-token.provider'

const TOKEN_URL = 'http://idp.internal:8080/realms/heka-platform/protocol/openid-connect/token'

const buildProvider = (overrides: Partial<DemoConfig> = {}) => {
  const config: DemoConfig = {
    enabled: true,
    tokenUrl: TOKEN_URL,
    clientId: 'heka-demo',
    clientSecret: 'demo-secret',
    clientAuthMethod: demoConfigDefaults.clientAuthMethod,
    tokenParams: {},
    rateLimit: demoConfigDefaults.rateLimit,
    ...overrides,
  }
  return new DemoTokenProvider(config, createMock<Logger>())
}

const fetchResponse = (body: unknown, status = 200) => ({
  ok: status < 300,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
})

const tokenResponse = (accessToken: string, expiresIn = 300) =>
  fetchResponse({ access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn })

const requestOf = (call: unknown[]) => {
  const [url, init] = call as [string, { method: string; headers: Record<string, string>; body: string }]
  return { url, init, form: Object.fromEntries(new URLSearchParams(init.body)) }
}

describe('DemoTokenProvider', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('refuses to hand out tokens when disabled', async () => {
    const provider = buildProvider({
      enabled: false,
      tokenUrl: undefined,
      clientId: undefined,
      clientSecret: undefined,
    })

    expect(provider.enabled).toBe(false)
    await expect(provider.getToken()).rejects.toThrow(/not enabled/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('runs the Client Credentials grant with the secret in the form body and caches the token', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-21T10:00:00Z'))
    fetchMock.mockResolvedValue(tokenResponse('demo-token', 300))
    const provider = buildProvider()

    const first = await provider.getToken()
    const second = await provider.getToken()

    expect(first).toEqual({ accessToken: 'demo-token', expiresAt: Date.now() + 300_000 })
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, init, form } = requestOf(fetchMock.mock.calls[0])
    expect(url).toBe(TOKEN_URL)
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(init.headers.authorization).toBeUndefined()
    expect(form).toEqual({ grant_type: 'client_credentials', client_id: 'heka-demo', client_secret: 'demo-secret' })
  })

  test('authenticates with HTTP Basic for client_secret_basic', async () => {
    fetchMock.mockResolvedValue(tokenResponse('demo-token'))
    const provider = buildProvider({ clientAuthMethod: 'client_secret_basic' })

    await provider.getToken()

    const { init, form } = requestOf(fetchMock.mock.calls[0])
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from('heka-demo:demo-secret').toString('base64')}`)
    expect(form).toEqual({ grant_type: 'client_credentials' })
  })

  test('adds token params (Auth0 audience) without letting them change the grant', async () => {
    fetchMock.mockResolvedValue(tokenResponse('demo-token'))
    const provider = buildProvider({ tokenParams: { audience: 'https://heka-identity', grant_type: 'password' } })

    await provider.getToken()

    const { form } = requestOf(fetchMock.mock.calls[0])
    expect(form).toEqual({
      audience: 'https://heka-identity',
      grant_type: 'client_credentials',
      client_id: 'heka-demo',
      client_secret: 'demo-secret',
    })
  })

  test('concurrent callers share a single token request', async () => {
    fetchMock.mockResolvedValue(tokenResponse('demo-token'))
    const provider = buildProvider()

    const tokens = await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()])

    expect(tokens.map((token) => token.accessToken)).toEqual(['demo-token', 'demo-token', 'demo-token'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('re-acquires a minute before expires_in elapses', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(tokenResponse('first', 300)).mockResolvedValue(tokenResponse('second', 300))
    const provider = buildProvider()

    expect((await provider.getToken()).accessToken).toBe('first')

    vi.advanceTimersByTime(239 * 1000)
    expect((await provider.getToken()).accessToken).toBe('first')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2 * 1000)
    expect((await provider.getToken()).accessToken).toBe('second')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('keeps short-lived tokens for half their lifetime and falls back to five minutes without expires_in', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-21T10:00:00Z'))
    fetchMock
      .mockResolvedValueOnce(tokenResponse('short', 60))
      .mockResolvedValueOnce(fetchResponse({ access_token: 'no-expiry' }))
    const provider = buildProvider()

    expect((await provider.getToken()).accessToken).toBe('short')
    vi.advanceTimersByTime(29 * 1000)
    expect((await provider.getToken()).accessToken).toBe('short')
    vi.advanceTimersByTime(2 * 1000)

    const fallback = await provider.getToken()
    expect(fallback.accessToken).toBe('no-expiry')
    expect(fallback.expiresAt).toBe(Date.now() + 300_000)
  })

  test('invalidate drops the cache', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('first')).mockResolvedValue(tokenResponse('second'))
    const provider = buildProvider()

    expect((await provider.getToken()).accessToken).toBe('first')
    provider.invalidate()
    expect((await provider.getToken()).accessToken).toBe('second')
  })

  test('surfaces grant failures with status and detail, and recovers on the next call', async () => {
    fetchMock
      .mockResolvedValueOnce(fetchResponse({ error: 'invalid_client' }, 401))
      .mockResolvedValue(tokenResponse('demo-token'))
    const provider = buildProvider()

    await expect(provider.getToken()).rejects.toThrow(
      /client credentials grant for 'heka-demo' at .* failed: 401 .*invalid_client/,
    )
    expect((await provider.getToken()).accessToken).toBe('demo-token')
  })

  test('reports an unreachable token endpoint', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }))
    const provider = buildProvider()

    await expect(provider.getToken()).rejects.toThrow(/token endpoint .* is unreachable: fetch failed \(ECONNREFUSED\)/)
  })

  test('rejects a token response without an access token', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ token_type: 'Bearer' }))
    const provider = buildProvider()

    await expect(provider.getToken()).rejects.toThrow(/no access token/)
  })
})
