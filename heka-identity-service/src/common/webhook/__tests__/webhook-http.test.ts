import type { AddressInfo } from 'node:net'

import dns from 'node:dns/promises'
import http from 'node:http'

import axios from 'axios'

import { createWebhookHttpOptions } from 'common/webhook/webhook-http'

/**
 * Exercises the outbound client with the options the NotificationModule actually registers,
 * against a local HTTP sink. Plain unit tests of the policy cannot catch the runtime contract
 * between the `lookup` hook and Node's socket layer.
 */
describe('webhook HTTP options', () => {
  let server: http.Server
  let port: number
  let requests: string[]

  const client = (overrides: { timeoutMs?: number; allowPrivateAddresses?: boolean } = {}) =>
    axios.create(
      createWebhookHttpOptions({
        timeoutMs: overrides.timeoutMs ?? 2_000,
        allowPrivateAddresses: overrides.allowPrivateAddresses ?? true,
      }),
    )

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requests.push(`${req.method} ${req.url}`)

      if (req.url === '/redirect') {
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/internal` })
        res.end()
        return
      }

      if (req.url === '/slow-drip') {
        res.writeHead(200)
        const interval = setInterval(() => res.write('x'), 100)
        req.socket.on('close', () => clearInterval(interval))
        return
      }

      res.end('ok')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(() => {
    server.closeAllConnections()
    server.close()
  })

  beforeEach(() => {
    requests = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Node's global agent keeps sockets alive; drop them so each test performs a fresh lookup.
    server.closeAllConnections()
  })

  // Regression test: Node >= 20 calls the agent/lookup hook with `{ all: true }`. A lookup that
  // answers with a bare address string makes every hostname-based webhook fail with
  // ERR_INVALID_IP_ADDRESS, which would silently disable webhook delivery altogether.
  test('delivers a POST to a hostname target on this Node runtime', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never)

    const response = await client().post(`http://sink.example.invalid:${port}/hook`, { event: 'test' })

    expect(response.status).toBe(200)
    expect(requests).toEqual(['POST /hook'])
  })

  test('does not connect when the resolved address is blocked', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never)

    await expect(
      client({ allowPrivateAddresses: false }).post(`http://blocked.example.invalid:${port}/hook`, {}),
    ).rejects.toMatchObject({ code: 'EADDRNOTAVAIL' })
    expect(requests).toEqual([])
  })

  test('does not follow redirects', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never)

    await expect(client().post(`http://redirect.example.invalid:${port}/redirect`, {})).rejects.toMatchObject({
      response: { status: 302 },
    })
    // The redirect target (an IP literal, which never passes through `lookup`) was not requested.
    expect(requests).toEqual(['POST /redirect'])
  })

  test('aborts a response that keeps trickling past the timeout', async () => {
    const startedAt = Date.now()

    await expect(
      client({ timeoutMs: 400 }).post(`http://127.0.0.1:${port}/slow-drip`, {}, { signal: AbortSignal.timeout(400) }),
    ).rejects.toMatchObject({ code: 'ERR_CANCELED' })

    // `timeout` alone is idle-based and would let a 100ms drip run indefinitely.
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })
})
