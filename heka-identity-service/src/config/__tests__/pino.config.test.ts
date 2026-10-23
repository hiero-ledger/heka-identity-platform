import { createServer } from 'node:http'
import { AddressInfo } from 'node:net'

import { pino } from 'pino'
import { pinoHttp } from 'pino-http'
import { describe, expect, it } from 'vitest'

import pinoConfig from 'config/pino'

const TOKEN = 'test.jwt.value'

interface LogEntry {
  msg?: string
  req: { headers: Record<string, string> }
  res: { headers: Record<string, string> }
  password?: string
  user?: object
}

/**
 * Pino options as the app builds them, without the transport (pino rejects a transport together with a stream)
 * and at `trace` level, so the tests do not depend on `PINO_LEVEL` (the e2e helpers set it in the same process).
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
})
