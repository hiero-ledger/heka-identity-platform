import { AdminApiClient, retryDelayMs } from '../directory/admin-api.client'
import { DirectoryError } from '../directory/directory.types'

const withHeaders = (headers: Record<string, string>) => ({ headers: new Headers(headers) })

describe('retryDelayMs', () => {
  test('honours Retry-After in seconds', () => {
    expect(retryDelayMs(withHeaders({ 'retry-after': '2' }), 0)).toBe(2000)
  })

  test("uses Auth0's X-RateLimit-Reset (epoch seconds) when there is no Retry-After", () => {
    const now = 1_000_000_000_000
    expect(retryDelayMs(withHeaders({ 'x-ratelimit-reset': String(now / 1000 + 3) }), 0, now)).toBe(3000)
  })

  test('falls back to an exponential backoff, and never waits longer than 10 seconds', () => {
    expect(retryDelayMs(withHeaders({}), 0)).toBe(250)
    expect(retryDelayMs(withHeaders({}), 3)).toBe(2000)
    expect(retryDelayMs(withHeaders({ 'retry-after': '120' }), 0)).toBe(10_000)
  })
})

describe('AdminApiClient', () => {
  const tokenResponse = () =>
    new Response(JSON.stringify({ access_token: 'admin-token', expires_in: 300 }), { status: 200 })
  const client = () =>
    new AdminApiClient({
      tokenUrl: 'https://idp/token',
      clientId: 'admin',
      clientSecret: 's',
      baseUrl: 'https://idp/api',
    })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('retries a 429 and returns the next answer, with one token for both requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'org_1' }]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(client().request('GET', '/organizations')).resolves.toEqual([{ id: 'org_1' }])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][1].headers.authorization).toBe('Bearer admin-token')
  })

  test('returns undefined for 404 and throws a DirectoryError for other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(new Response('', { status: 404 }))
        .mockResolvedValueOnce(new Response('denied', { status: 403 })),
    )
    const api = client()

    await expect(api.request('GET', '/users/x')).resolves.toBeUndefined()
    await expect(api.request('GET', '/organizations')).rejects.toBeInstanceOf(DirectoryError)
  })

  test('throws a DirectoryError when the service account cannot get a token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))

    await expect(client().request('GET', '/organizations')).rejects.toThrow(/client credentials grant for 'admin'/)
  })
})
