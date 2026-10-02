import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { AddressInfo } from 'net'

import { HttpService } from '@nestjs/axios'
import { UnauthorizedException } from '@nestjs/common'
import axios from 'axios'

import { Logger } from 'common/logger'

import { TokenRevocationService } from '../token-revocation.service'

const TOKEN = 'header.payload-with-secret-claims.signature'

type Handler = (req: IncomingMessage, res: ServerResponse) => void

function createFakeLogger() {
  const child = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const logger = { ...child, child: vi.fn().mockReturnValue(child) }
  return { logger, child }
}

describe('TokenRevocationService', () => {
  let server: Server
  let url: string
  let handler: Handler
  let received: IncomingMessage[]

  beforeAll(async () => {
    server = createServer((req, res) => {
      received.push(req)
      handler(req, res)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/oauth/introspect`
  })

  afterAll(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    received = []
    handler = (_req, res) => respondJson(res, 200, { active: true })
  })

  function respondJson(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  function createService(config: { enabled: boolean; url?: string; timeoutMs?: number }) {
    const httpService = new HttpService(axios.create())
    const post = vi.spyOn(httpService.axiosRef, 'post')
    const { logger, child } = createFakeLogger()
    const service = new TokenRevocationService(
      httpService,
      { url: undefined, timeoutMs: 3000, ...config },
      logger as unknown as Logger,
    )
    const logged = () => JSON.stringify([logger, child].flatMap((l) => Object.values(l).map((fn) => fn.mock.calls)))
    return { service, post, child, logged }
  }

  test('does nothing when disabled', async () => {
    const { service, post } = createService({ enabled: false, url })

    await expect(service.assertTokenActive(TOKEN)).resolves.toBeUndefined()

    expect(post).not.toHaveBeenCalled()
    expect(received).toHaveLength(0)
  })

  test('resolves for an active token and sends it as a Bearer token', async () => {
    const { service, logged } = createService({ enabled: true, url })

    await expect(service.assertTokenActive(TOKEN)).resolves.toBeUndefined()

    expect(received).toHaveLength(1)
    expect(received[0].method).toBe('POST')
    expect(received[0].url).toBe('/api/v1/oauth/introspect')
    expect(received[0].headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(logged()).not.toContain(TOKEN)
  })

  test('rejects a token reported as inactive', async () => {
    handler = (_req, res) => respondJson(res, 200, { active: false })
    const { service, child, logged } = createService({ enabled: true, url })

    await expect(service.assertTokenActive(TOKEN)).rejects.toThrow(UnauthorizedException)

    expect(child.warn).not.toHaveBeenCalled()
    expect(logged()).not.toContain(TOKEN)
  })

  test.each([401, 403])('rejects the token when Auth Service answers %i', async (status) => {
    handler = (_req, res) => respondJson(res, status, { message: 'Unauthorized' })
    const { service, child } = createService({ enabled: true, url })

    await expect(service.assertTokenActive(TOKEN)).rejects.toThrow(UnauthorizedException)

    expect(child.warn).not.toHaveBeenCalled()
  })

  test.each([429, 500, 502, 503, 404])('fails closed and warns when Auth Service answers %i', async (status) => {
    handler = (_req, res) => respondJson(res, status, { active: true })
    const { service, child, logged } = createService({ enabled: true, url })

    await expect(service.assertTokenActive(TOKEN)).rejects.toThrow(UnauthorizedException)

    expect(child.warn).toHaveBeenCalledWith({ status }, expect.any(String))
    expect(logged()).not.toContain(TOKEN)
  })

  test.each([
    ['a non-JSON body', (res: ServerResponse) => res.writeHead(200).end('ok')],
    ['a body without `active`', (res: ServerResponse) => respondJson(res, 200, { valid: true })],
    ['a non-boolean `active`', (res: ServerResponse) => respondJson(res, 200, { active: 'true' })],
  ])('fails closed and warns on 200 with %s', async (_name, respond) => {
    handler = (_req, res) => respond(res)
    const { service, child } = createService({ enabled: true, url })

    await expect(service.assertTokenActive(TOKEN)).rejects.toThrow(UnauthorizedException)

    expect(child.warn).toHaveBeenCalled()
  })

  test('does not follow redirects', async () => {
    handler = (req, res) => {
      if (req.url === '/elsewhere') return respondJson(res, 200, { active: true })
      res.writeHead(302, { Location: '/elsewhere' }).end()
    }
    const { service } = createService({ enabled: true, url })

    await expect(service.assertTokenActive(TOKEN)).rejects.toThrow(UnauthorizedException)

    expect(received).toHaveLength(1)
  })

  test('fails closed within the timeout when Auth Service does not answer', async () => {
    handler = () => {
      // never respond
    }
    const { service, child, logged } = createService({ enabled: true, url, timeoutMs: 200 })

    const startedAt = Date.now()
    await expect(service.assertTokenActive(TOKEN)).rejects.toThrow(UnauthorizedException)

    expect(Date.now() - startedAt).toBeLessThan(2000)
    expect(child.warn).toHaveBeenCalledTimes(1)
    expect(logged()).not.toContain(TOKEN)
  })

  test('fails closed when Auth Service is unreachable', async () => {
    // Bind and release a port so nothing listens on it
    const closed = createServer()
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise((resolve) => closed.close(resolve))

    const { service, child, logged } = createService({ enabled: true, url: `http://127.0.0.1:${port}/introspect` })

    await expect(service.assertTokenActive(TOKEN)).rejects.toThrow(UnauthorizedException)

    expect(child.warn).toHaveBeenCalledWith(
      { error: expect.objectContaining({ code: 'ECONNREFUSED' }) },
      expect.any(String),
    )
    expect(logged()).not.toContain(TOKEN)
  })

  test('fails closed when enabled without a URL', async () => {
    const { service, post } = createService({ enabled: true, url: undefined })

    await expect(service.assertTokenActive(TOKEN)).rejects.toThrow(UnauthorizedException)

    expect(post).not.toHaveBeenCalled()
  })
})
