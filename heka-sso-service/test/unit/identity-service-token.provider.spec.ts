import { ConfigService, OidcConfig } from '../../src/core/config'
import { IdentityServiceTokenProvider } from '../../src/oidc'

const buildProvider = (env: Record<string, string> = {}) => {
  const config = new OidcConfig({
    IDENTITY_SERVICE_BASE_URL: 'http://identity.internal:3000',
    AUTH_SERVICE_BASE_URL: 'http://auth.internal:3004',
    ...env,
  })
  return new IdentityServiceTokenProvider({ oidcConfig: config } as unknown as ConfigService)
}

const serviceAccountEnv = {
  IDENTITY_SERVICE_AUTH_NAME: 'sso-bridge',
  IDENTITY_SERVICE_AUTH_PASSWORD: 'service-account-password',
}

const fetchResponse = (body: unknown, status = 200) => ({
  ok: status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

const loginResponse = (access: string, expiresIn = 3600) =>
  fetchResponse({ access, refresh: 'refresh-token', token_type: 'Bearer', expires_in: expiresIn })

/**
 * Identity-service service account (P1.6.7): lazy login against
 * heka-auth-service, cached token, re-acquired shortly before expiry;
 * `IDENTITY_SERVICE_AUTH_TOKEN` stays as a static override.
 */
describe('IdentityServiceTokenProvider', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('static override wins — no login is attempted', async () => {
    const provider = buildProvider({ ...serviceAccountEnv, IDENTITY_SERVICE_AUTH_TOKEN: 'static-token' })

    expect(await provider.getToken()).toBe('static-token')
    expect(provider.usesLogin).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('returns undefined when neither a token nor credentials are configured', async () => {
    const provider = buildProvider()

    expect(await provider.getToken()).toBeUndefined()
    expect(provider.usesLogin).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('logs in lazily and caches the token', async () => {
    fetchMock.mockResolvedValue(loginResponse('acquired-token'))
    const provider = buildProvider(serviceAccountEnv)

    expect(provider.usesLogin).toBe(true)
    expect(await provider.getToken()).toBe('acquired-token')
    expect(await provider.getToken()).toBe('acquired-token')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://auth.internal:3004/api/v1/oauth/token')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'sso-bridge', password: 'service-account-password' })
  })

  test('concurrent callers share a single login', async () => {
    fetchMock.mockResolvedValue(loginResponse('acquired-token'))
    const provider = buildProvider(serviceAccountEnv)

    const tokens = await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()])

    expect(tokens).toEqual(['acquired-token', 'acquired-token', 'acquired-token'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('re-acquires shortly before expires_in elapses', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(loginResponse('first-token', 3600)).mockResolvedValue(loginResponse('second-token'))
    const provider = buildProvider(serviceAccountEnv)

    expect(await provider.getToken()).toBe('first-token')

    // still inside the refresh window (expires_in − 60s margin)
    vi.advanceTimersByTime(3539 * 1000)
    expect(await provider.getToken()).toBe('first-token')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // past it — a fresh login happens before the old token expires
    vi.advanceTimersByTime(2 * 1000)
    expect(await provider.getToken()).toBe('second-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('invalidate drops the cache so the next call logs in again', async () => {
    fetchMock.mockResolvedValueOnce(loginResponse('first-token')).mockResolvedValue(loginResponse('second-token'))
    const provider = buildProvider(serviceAccountEnv)

    expect(await provider.getToken()).toBe('first-token')
    provider.invalidate()
    expect(await provider.getToken()).toBe('second-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('surfaces login failures with status and detail, and recovers on the next call', async () => {
    fetchMock
      .mockResolvedValueOnce(fetchResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValue(loginResponse('acquired-token'))
    const provider = buildProvider(serviceAccountEnv)

    await expect(provider.getToken()).rejects.toThrow(/service account 'sso-bridge' failed: 401/)
    // a failed login is not cached — the next call tries again
    expect(await provider.getToken()).toBe('acquired-token')
  })

  test('rejects a login response without an access token', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ token_type: 'Bearer' }))
    const provider = buildProvider(serviceAccountEnv)

    await expect(provider.getToken()).rejects.toThrow(/no access token/)
  })
})
