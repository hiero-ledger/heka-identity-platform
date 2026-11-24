import { createMock } from '@golevelup/ts-vitest'
import { UnauthorizedException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { Logger } from 'common/logger'
import { OidcConfig, oidcClaimsDefaults, oidcConfigDefaults } from 'config/oidc'
import { TokenIntrospectionConfig, tokenIntrospectionConfigDefaults } from 'config/token-introspection'

import { TokenIntrospectionService } from '../token-introspection.service'

const ISSUER = 'http://idp.internal:8080/realms/heka-platform'
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`
const INTROSPECTION_URL = `${ISSUER}/protocol/openid-connect/token/introspect`

const oidcConfig: OidcConfig = {
  issuerUrl: ISSUER,
  audience: 'heka-identity-service',
  algorithms: oidcConfigDefaults.algorithms,
  clockTolerance: oidcConfigDefaults.clockTolerance,
  claims: oidcClaimsDefaults,
}

const buildService = (overrides: Partial<TokenIntrospectionConfig> = {}) => {
  const config: TokenIntrospectionConfig = {
    enabled: true,
    url: INTROSPECTION_URL,
    clientId: 'heka-identity-service',
    clientSecret: 'introspection-secret',
    clientAuthMethod: tokenIntrospectionConfigDefaults.clientAuthMethod,
    timeoutMs: tokenIntrospectionConfigDefaults.timeoutMs,
    requireHttps: false,
    ...overrides,
  }
  const childLogger = createMock<Logger>()
  const logger = createMock<Logger>({ child: vi.fn().mockReturnValue(childLogger) })
  return { service: new TokenIntrospectionService(config, oidcConfig, logger), childLogger }
}

const fetchResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => (body instanceof Error ? Promise.reject(body) : Promise.resolve(body)),
})

const requestOf = (call: unknown[]) => {
  const [url, init] = call as [string, RequestInit & { headers: Record<string, string>; body: string }]
  return { url, init, form: Object.fromEntries(new URLSearchParams(init.body)) }
}

describe('TokenIntrospectionService', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('does nothing when disabled', async () => {
    const { service } = buildService({ enabled: false })

    await expect(service.assertTokenActive('token')).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('accepts a token the provider reports as active', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ active: true, client_id: 'heka-web-ui' }))
    const { service } = buildService()

    await expect(service.assertTokenActive('my-token')).resolves.toBeUndefined()
  })

  test('sends an RFC 7662 request with client_secret_basic by default', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ active: true }))
    const { service } = buildService()

    await service.assertTokenActive('my-token')

    const { url, init, form } = requestOf(fetchMock.mock.calls[0])
    expect(url).toBe(INTROSPECTION_URL)
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(init.headers.authorization).toBe(
      `Basic ${Buffer.from('heka-identity-service:introspection-secret').toString('base64')}`,
    )
    expect(form).toEqual({ token: 'my-token', token_type_hint: 'access_token' })
  })

  test('sends the client credentials in the body with client_secret_post', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ active: true }))
    const { service } = buildService({ clientAuthMethod: 'client_secret_post' })

    await service.assertTokenActive('my-token')

    const { init, form } = requestOf(fetchMock.mock.calls[0])
    expect(init.headers.authorization).toBeUndefined()
    expect(form).toEqual({
      token: 'my-token',
      token_type_hint: 'access_token',
      client_id: 'heka-identity-service',
      client_secret: 'introspection-secret',
    })
  })

  test('rejects a token the provider reports as inactive', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ active: false }))
    const { service } = buildService()

    await expect(service.assertTokenActive('revoked-token')).rejects.toThrow(
      new UnauthorizedException('Token is not active'),
    )
  })

  test.each([400, 401, 403])(
    'reports rejected client credentials (%i) as a server error, not as a bad token',
    async (status) => {
      fetchMock.mockResolvedValue(fetchResponse({ error: 'invalid_client' }, status))
      const { service, childLogger } = buildService()

      const error: unknown = await service.assertTokenActive('token').catch((e: unknown) => e)
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(UnauthorizedException)
      expect(String(error)).toContain("rejected client 'heka-identity-service'")
      expect(String(error)).not.toContain('introspection-secret')
      expect(childLogger.error).toHaveBeenCalled()
    },
  )

  test.each([302, 429, 500, 503])('fails closed on HTTP %i and releases the response body', async (status) => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    fetchMock.mockResolvedValue({ ...fetchResponse({}, status), body: { cancel } })
    const { service } = buildService()

    await expect(service.assertTokenActive('token')).rejects.toThrow(UnauthorizedException)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  // R6: AbortSignal.timeout rejects with a DOMException named TimeoutError
  test('fails closed when the introspection request times out', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    const { service } = buildService()

    await expect(service.assertTokenActive('token')).rejects.toThrow(UnauthorizedException)
  })

  test.each([
    ['a non-JSON body', new SyntaxError('Unexpected token')],
    ['a body without active', { client_id: 'x' }],
    ['a non-boolean active', { active: 'true' }],
  ])('fails closed on %s', async (_name, body) => {
    fetchMock.mockResolvedValue(fetchResponse(body))
    const { service } = buildService()

    await expect(service.assertTokenActive('token')).rejects.toThrow(UnauthorizedException)
  })

  test('fails closed when the endpoint is unreachable or times out, without logging the token', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(), { code: 'ECONNREFUSED' }) }),
    )
    const { service, childLogger } = buildService()

    await expect(service.assertTokenActive('secret-token')).rejects.toThrow(UnauthorizedException)

    const warn = vi.mocked(childLogger.warn)
    expect(warn).toHaveBeenCalled()
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-token')
    expect(JSON.stringify(warn.mock.calls)).toContain('ECONNREFUSED')
  })

  describe('endpoint discovery', () => {
    test('takes the endpoint from the discovery document once', async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url === DISCOVERY_URL
            ? fetchResponse({ issuer: ISSUER, introspection_endpoint: INTROSPECTION_URL })
            : fetchResponse({ active: true }),
        ),
      )
      const { service } = buildService({ url: undefined })

      await service.assertTokenActive('token-1')
      await service.assertTokenActive('token-2')

      const urls = fetchMock.mock.calls.map(([url]) => url as string)
      expect(urls).toEqual([DISCOVERY_URL, INTROSPECTION_URL, INTROSPECTION_URL])
    })

    test('reports a provider without an introspection endpoint as a server error', async () => {
      fetchMock.mockResolvedValue(fetchResponse({ issuer: ISSUER }))
      const { service } = buildService({ url: undefined })

      const error: unknown = await service.assertTokenActive('token').catch((e: unknown) => e)
      expect(error).not.toBeInstanceOf(UnauthorizedException)
      expect(String(error)).toContain('returned no introspection_endpoint')
    })

    test('fetches discovery with a deadline and without following redirects', async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url === DISCOVERY_URL
            ? fetchResponse({ issuer: ISSUER, introspection_endpoint: INTROSPECTION_URL })
            : fetchResponse({ active: true }),
        ),
      )
      const { service } = buildService({ url: undefined })

      await service.assertTokenActive('token')

      const { init } = requestOf([DISCOVERY_URL, fetchMock.mock.calls[0][1]])
      expect(init.redirect).toBe('manual')
      expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    test('treats a redirected discovery response as a server error', async () => {
      fetchMock.mockResolvedValue(fetchResponse({}, 302))
      const { service } = buildService({ url: undefined })

      const error: unknown = await service.assertTokenActive('token').catch((e: unknown) => e)
      expect(error).not.toBeInstanceOf(UnauthorizedException)
      expect(String(error)).toContain('HTTP 302')
    })

    test('requires an https issuer when https is required', async () => {
      const { service } = buildService({ url: undefined, requireHttps: true })

      const error: unknown = await service.assertTokenActive('token').catch((e: unknown) => e)
      expect(String(error)).toContain('must use HTTPS in production')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('rejects a discovered http endpoint when https is required', async () => {
      const httpsIssuer = 'https://idp.example.com/realms/heka-platform'
      fetchMock.mockResolvedValue(fetchResponse({ issuer: httpsIssuer, introspection_endpoint: INTROSPECTION_URL }))
      const logger = createMock<Logger>({ child: vi.fn().mockReturnValue(createMock<Logger>()) })
      const service = new TokenIntrospectionService(
        {
          enabled: true,
          clientId: 'heka-identity-service',
          clientSecret: 'introspection-secret',
          clientAuthMethod: tokenIntrospectionConfigDefaults.clientAuthMethod,
          timeoutMs: tokenIntrospectionConfigDefaults.timeoutMs,
          requireHttps: true,
        },
        { ...oidcConfig, issuerUrl: httpsIssuer },
        logger,
      )

      const error: unknown = await service.assertTokenActive('token').catch((e: unknown) => e)
      expect(error).not.toBeInstanceOf(UnauthorizedException)
      expect(String(error)).toContain('introspection_endpoint discovered at')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test.each([
      ['a non-string endpoint', { issuer: ISSUER, introspection_endpoint: 42 }, 'returned no introspection_endpoint'],
      [
        'a malformed endpoint',
        { issuer: ISSUER, introspection_endpoint: 'not a url' },
        'returned an invalid introspection_endpoint',
      ],
    ])('reports %s as a server error and does not cache it', async (_name, document, message) => {
      fetchMock.mockResolvedValue(fetchResponse(document))
      const { service } = buildService({ url: undefined })

      const error: unknown = await service.assertTokenActive('token').catch((e: unknown) => e)
      expect(error).not.toBeInstanceOf(UnauthorizedException)
      expect(String(error)).toContain(message)

      await service.assertTokenActive('token').catch(() => undefined)
      expect(fetchMock.mock.calls.every(([url]) => url === DISCOVERY_URL)).toBe(true)
    })

    test.each([
      [
        'a different issuer',
        { issuer: 'https://evil.example.com/realms/heka-platform', introspection_endpoint: INTROSPECTION_URL },
      ],
      ['no issuer', { introspection_endpoint: INTROSPECTION_URL }],
    ])('rejects a discovery document with %s before using its endpoint', async (_name, document) => {
      fetchMock.mockResolvedValue(fetchResponse(document))
      const { service } = buildService({ url: undefined })

      const error: unknown = await service.assertTokenActive('token').catch((e: unknown) => e)
      expect(error).not.toBeInstanceOf(UnauthorizedException)
      expect(String(error)).toContain('returned an unexpected issuer')
      expect(fetchMock.mock.calls.every(([url]) => url === DISCOVERY_URL)).toBe(true)
    })

    test('shares one discovery between concurrent requests', async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url === DISCOVERY_URL
            ? fetchResponse({ issuer: ISSUER, introspection_endpoint: INTROSPECTION_URL })
            : fetchResponse({ active: true }),
        ),
      )
      const { service } = buildService({ url: undefined })

      await Promise.all([
        service.assertTokenActive('a'),
        service.assertTokenActive('b'),
        service.assertTokenActive('c'),
      ])

      const urls = fetchMock.mock.calls.map(([url]) => url as string)
      expect(urls.filter((url) => url === DISCOVERY_URL)).toHaveLength(1)
      expect(urls.filter((url) => url === INTROSPECTION_URL)).toHaveLength(3)
    })

    test('retries discovery after a failure', async () => {
      fetchMock
        .mockResolvedValueOnce(fetchResponse({}, 503))
        .mockResolvedValueOnce(fetchResponse({ issuer: ISSUER, introspection_endpoint: INTROSPECTION_URL }))
        .mockResolvedValueOnce(fetchResponse({ active: true }))
      const { service } = buildService({ url: undefined })

      await expect(service.assertTokenActive('token')).rejects.toThrow('HTTP 503')
      await expect(service.assertTokenActive('token')).resolves.toBeUndefined()
    })
  })
})
