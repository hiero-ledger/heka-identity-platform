import { createServer } from 'node:http'
import { AddressInfo } from 'node:net'

import express from 'express'
import { pino } from 'pino'
import { pinoHttp } from 'pino-http'
import { describe, expect, it } from 'vitest'

import { maskSecretsInRequest, maskSecretsInUrl } from 'common/logger/mask-request'
import pinoConfig from 'config/pino'

const TOKEN = 'test.jwt.value'

interface LogEntry {
  msg?: string
  req: { headers: Record<string, string>; url?: string; query?: Record<string, string> }
  res: { headers: Record<string, string> }
  password?: string
  user?: object
}

/**
 * Pino options as the app builds them, without the transport (pino rejects a transport together with a stream)
 * and at `trace` level, so the tests do not depend on `PINO_LEVEL`.
 */
const loggerOptions = () => ({ ...pinoConfig(), transport: undefined, level: 'trace' })

/** A synchronous destination that keeps every log line. */
const collectingStream = () => {
  const lines: string[] = []
  return { lines, write: (line: string) => void lines.push(line) }
}

describe('pino config', () => {
  it('redacts credential-carrying request and response headers on every line of a request', async () => {
    const stream = collectingStream()
    const httpLogger = pinoHttp(loggerOptions(), stream)

    let completed!: Promise<void>
    const server = createServer((req, res) => {
      httpLogger(req, res)
      // Registered after pino-http's own listener, so `request completed` has been written when this resolves
      completed = new Promise((resolve) => res.once('finish', () => resolve()))
      req.log.info('inside')
      res.setHeader('set-cookie', 'sid=SET')
      res.end('ok')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    try {
      const { port } = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${port}/schemas`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Cookie: 'sid=C',
          'Proxy-Authorization': 'Basic PROXY',
          'Sec-WebSocket-Protocol': `heka.bearer, ${TOKEN}`,
          'User-Agent': 'pino-config-test',
        },
      })
      await response.text()
      await completed
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }

    const output = stream.lines.join('')
    expect(output).not.toContain(TOKEN)
    expect(output).not.toContain('sid=C')
    expect(output).not.toContain('sid=SET')
    expect(output).not.toContain('PROXY')

    const entries = stream.lines.map((line) => JSON.parse(line) as LogEntry)
    const inside = entries.find((entry) => entry.msg === 'inside')
    const completedEntry = entries.find((entry) => entry.msg === 'request completed')
    if (!inside || !completedEntry) throw new Error(`expected 'inside' and 'request completed' lines, got: ${output}`)

    for (const entry of [inside, completedEntry]) {
      expect(entry.req.headers.authorization).toBe('******')
      expect(entry.req.headers.cookie).toBe('******')
      expect(entry.req.headers['proxy-authorization']).toBe('******')
      expect(entry.req.headers['sec-websocket-protocol']).toBe('******')
      expect(entry.req.headers.host).toMatch(/^127\.0\.0\.1:\d+$/)
      expect(entry.req.headers['user-agent']).toBe('pino-config-test')
    }
    expect(completedEntry.res.headers['set-cookie']).toBe('******')
  })

  it('still redacts passwords', () => {
    const stream = collectingStream()

    pino(loggerOptions(), stream).info({ password: 'p', user: { name: 'alice', password: 'p' } })

    expect(stream.lines).toHaveLength(1)
    const entry = JSON.parse(stream.lines[0]) as LogEntry
    expect(entry.password).toBe('******')
    expect(entry.user).toEqual({ name: 'alice', password: '******' })
  })

  it('masks OID4VCI secrets in the logged URL and query without changing what the handler reads', async () => {
    const stream = collectingStream()
    const app = express()
    app.use(pinoHttp(loggerOptions(), stream))

    let handlerSaw: unknown
    let completed!: Promise<void>
    app.get('/openid4vc/issuance-session', (req, res) => {
      completed = new Promise((resolve) => res.once('finish', () => resolve()))
      req.log.info('inside')
      handlerSaw = req.query.preAuthorizedCode
      res.end('ok')
    })
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))

    try {
      const { port } = server.address() as AddressInfo
      const query =
        'preAuthorizedCode=PRE-CODE-SECRET&credentialOfferUri=OFFER-URI-SECRET&cNonce=C-NONCE-SECRET&publicIssuerId=pub1'
      const response = await fetch(`http://127.0.0.1:${port}/openid4vc/issuance-session?${query}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      })
      await response.text()
      await completed
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }

    expect(handlerSaw).toBe('PRE-CODE-SECRET')

    const output = stream.lines.join('')
    for (const secret of ['PRE-CODE-SECRET', 'OFFER-URI-SECRET', 'C-NONCE-SECRET', TOKEN]) {
      expect(output).not.toContain(secret)
    }

    const entries = stream.lines.map((line) => JSON.parse(line) as LogEntry)
    const inside = entries.find((entry) => entry.msg === 'inside')
    const completedEntry = entries.find((entry) => entry.msg === 'request completed')
    if (!inside || !completedEntry) throw new Error(`expected 'inside' and 'request completed' lines, got: ${output}`)

    for (const entry of [inside, completedEntry]) {
      expect(entry.req.url).toBe(
        '/openid4vc/issuance-session?preAuthorizedCode=******&credentialOfferUri=******&cNonce=******&publicIssuerId=pub1',
      )
      expect(entry.req.query).toEqual({
        preAuthorizedCode: '******',
        credentialOfferUri: '******',
        cNonce: '******',
        publicIssuerId: 'pub1',
      })
      expect(entry.req.headers.authorization).toBe('******')
    }
  })
})

describe('maskSecretsInRequest', () => {
  it('masks the listed parameters in the URL and the query and leaves the input untouched', () => {
    const query = { preAuthorizedCode: 'P', state: 'OfferCreated' }
    const req = { method: 'GET', url: '/x?state=OfferCreated&preAuthorizedCode=P#frag', query, headers: { host: 'h' } }

    const masked = maskSecretsInRequest(req)

    expect(masked).toEqual({
      method: 'GET',
      url: '/x?state=OfferCreated&preAuthorizedCode=******#frag',
      query: { preAuthorizedCode: '******', state: 'OfferCreated' },
      headers: { host: 'h' },
    })
    expect(req.url).toBe('/x?state=OfferCreated&preAuthorizedCode=P#frag')
    expect(query).toEqual({ preAuthorizedCode: 'P', state: 'OfferCreated' })
  })

  it('masks a percent-encoded parameter name, as the query parser decodes it', () => {
    expect(maskSecretsInRequest({ url: '/x?pre%41uthorizedCode=P' }).url).toBe('/x?pre%41uthorizedCode=******')
  })

  it('is case-sensitive, like the query DTO', () => {
    expect(maskSecretsInRequest({ url: '/x?preauthorizedcode=P' }).url).toBe('/x?preauthorizedcode=P')
  })

  it.each([
    ['a URL without a query string', { method: 'GET', url: '/openid4vc/issuance-session' }],
    ['a URL without listed parameters', { url: '/x?publicIssuerId=pub1&state=done', query: { state: 'done' } }],
    ['a body DTO', { preAuthorizedCodeFlowConfig: { txCode: {} }, credentials: [] }],
    ['an object with non-string url and query', { url: 42, query: 'preAuthorizedCode=P' }],
  ])('returns %s unchanged', (_name, value) => {
    expect(maskSecretsInRequest(value)).toBe(value)
  })

  it.each([undefined, null, 'GET /x?preAuthorizedCode=P', 42])('returns %s as is', (value) => {
    expect(maskSecretsInRequest(value)).toBe(value)
  })
})

describe('maskSecretsInUrl', () => {
  it('masks the listed parameters and keeps the path and the other parameters', () => {
    expect(maskSecretsInUrl('/a/b?cNonce=N&x=1&credentialOfferUri=U')).toBe(
      '/a/b?cNonce=******&x=1&credentialOfferUri=******',
    )
  })

  it.each([undefined, '/a/b', '/a/b?x=1', ''])('returns %s unchanged', (url) => {
    expect(maskSecretsInUrl(url)).toBe(url)
  })
})
