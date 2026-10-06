import { ConfigService, OidcConfig } from '../../src/core/config'
import { IdentityServiceTokenProvider } from '../../src/oidc'

const TOKEN_URL = 'http://idp.internal:8080/realms/heka/protocol/openid-connect/token'

const buildProvider = (env: Record<string, string> = {}) => {
  const config = new OidcConfig({
    IDENTITY_SERVICE_BASE_URL: 'http://identity.internal:3000',
    ...env,
  })
  return new IdentityServiceTokenProvider({ oidcConfig: config } as unknown as ConfigService)
}

const clientCredentialsEnv = {
  IDENTITY_SERVICE_TOKEN_URL: TOKEN_URL,
  IDENTITY_SERVICE_CLIENT_ID: 'heka-sso-service',
  IDENTITY_SERVICE_CLIENT_SECRET: 'service-account-secret',
}

const fetchResponse = (body: unknown, status = 200) => ({
  ok: status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

const tokenResponse = (accessToken: string, expiresIn = 3600) =>
  fetchResponse({ access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn, scope: 'profile email' })

const requestOf = (call: unknown[]) => {
  const [url, init] = call as [string, { method: string; headers: Record<string, string>; body: string }]
  return { url, init, form: Object.fromEntries(new URLSearchParams(init.body)) }
}

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

  test('static override wins — no token request is made', async () => {
    const provider = buildProvider({ ...clientCredentialsEnv, IDENTITY_SERVICE_AUTH_TOKEN: 'static-token' })

    expect(await provider.getToken()).toBe('static-token')
    expect(provider.usesLogin).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('returns undefined when neither a token nor client credentials are configured', async () => {
    const provider = buildProvider()

    expect(await provider.getToken()).toBeUndefined()
    expect(provider.usesLogin).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('runs the Client Credentials grant lazily, with the client secret in the form body, and caches the token', async () => {
    fetchMock.mockResolvedValue(tokenResponse('acquired-token'))
    const provider = buildProvider(clientCredentialsEnv)

    expect(provider.usesLogin).toBe(true)
    expect(await provider.getToken()).toBe('acquired-token')
    expect(await provider.getToken()).toBe('acquired-token')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, init, form } = requestOf(fetchMock.mock.calls[0])
    expect(url).toBe(TOKEN_URL)
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(init.headers.authorization).toBeUndefined()
    expect(form).toEqual({
      grant_type: 'client_credentials',
      client_id: 'heka-sso-service',
      client_secret: 'service-account-secret',
    })
  })

  test('authenticates with HTTP Basic when IDENTITY_SERVICE_CLIENT_AUTH_METHOD=client_secret_basic', async () => {
    fetchMock.mockResolvedValue(tokenResponse('acquired-token'))
    const provider = buildProvider({ ...clientCredentialsEnv, IDENTITY_SERVICE_CLIENT_AUTH_METHOD: 'client_secret_basic' })

    expect(await provider.getToken()).toBe('acquired-token')

    const { init, form } = requestOf(fetchMock.mock.calls[0])
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from('heka-sso-service:service-account-secret').toString('base64')}`)
    expect(form).toEqual({ grant_type: 'client_credentials' })
  })

  test('adds IDENTITY_SERVICE_TOKEN_PARAMS as form fields (Auth0 audience) without letting them change the grant', async () => {
    fetchMock.mockResolvedValue(tokenResponse('acquired-token'))
    const provider = buildProvider({
      ...clientCredentialsEnv,
      IDENTITY_SERVICE_TOKEN_PARAMS: JSON.stringify({ audience: 'https://heka-identity', scope: 'openid', grant_type: 'password' }),
    })

    expect(await provider.getToken()).toBe('acquired-token')

    const { form } = requestOf(fetchMock.mock.calls[0])
    expect(form).toMatchObject({ audience: 'https://heka-identity', scope: 'openid', grant_type: 'client_credentials' })
  })

  test('concurrent callers share a single token request', async () => {
    fetchMock.mockResolvedValue(tokenResponse('acquired-token'))
    const provider = buildProvider(clientCredentialsEnv)

    const tokens = await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()])

    expect(tokens).toEqual(['acquired-token', 'acquired-token', 'acquired-token'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('re-acquires shortly before expires_in elapses', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(tokenResponse('first-token', 3600)).mockResolvedValue(tokenResponse('second-token'))
    const provider = buildProvider(clientCredentialsEnv)

    expect(await provider.getToken()).toBe('first-token')

    // still inside the refresh window (expires_in − 60s margin)
    vi.advanceTimersByTime(3539 * 1000)
    expect(await provider.getToken()).toBe('first-token')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // past it — a fresh grant happens before the old token expires
    vi.advanceTimersByTime(2 * 1000)
    expect(await provider.getToken()).toBe('second-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('falls back to a one-hour refresh window when expires_in is missing', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(fetchResponse({ access_token: 'first-token' })).mockResolvedValue(tokenResponse('second-token'))
    const provider = buildProvider(clientCredentialsEnv)

    expect(await provider.getToken()).toBe('first-token')
    vi.advanceTimersByTime(3539 * 1000)
    expect(await provider.getToken()).toBe('first-token')
    vi.advanceTimersByTime(2 * 1000)
    expect(await provider.getToken()).toBe('second-token')
  })

  test('invalidate drops the cache so the next call requests a token again', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('first-token')).mockResolvedValue(tokenResponse('second-token'))
    const provider = buildProvider(clientCredentialsEnv)

    expect(await provider.getToken()).toBe('first-token')
    provider.invalidate()
    expect(await provider.getToken()).toBe('second-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('surfaces grant failures with status and detail, and recovers on the next call', async () => {
    fetchMock
      .mockResolvedValueOnce(fetchResponse({ error: 'invalid_client', error_description: 'Invalid client credentials' }, 401))
      .mockResolvedValue(tokenResponse('acquired-token'))
    const provider = buildProvider(clientCredentialsEnv)

    await expect(provider.getToken()).rejects.toThrow(/client credentials grant for 'heka-sso-service' at .* failed: 401 .*invalid_client/)
    // a failed grant is not cached — the next call tries again
    expect(await provider.getToken()).toBe('acquired-token')
  })

  test('reports an unreachable token endpoint', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const provider = buildProvider(clientCredentialsEnv)

    await expect(provider.getToken()).rejects.toThrow(/token endpoint .* is unreachable/)
  })

  test('rejects a token response without an access token', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ token_type: 'Bearer' }))
    const provider = buildProvider(clientCredentialsEnv)

    await expect(provider.getToken()).rejects.toThrow(/no access token/)
  })
})
