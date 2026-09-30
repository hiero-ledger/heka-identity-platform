import type { AddressInfo } from 'node:net'

import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'

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
  // Stands in for an egress proxy configured through the environment; it must never be used.
  let proxy: http.Server
  let proxyPort: number
  let proxyRequests: string[]

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

    proxy = http.createServer((req, res) => {
      proxyRequests.push(`${req.method} ${req.url}`)
      res.end('proxied')
    })
    proxy.on('connect', (req, socket) => {
      proxyRequests.push(`CONNECT ${req.url}`)
      socket.destroy()
    })
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    proxyPort = (proxy.address() as AddressInfo).port
  })

  afterAll(() => {
    server.closeAllConnections()
    server.close()
    proxy.closeAllConnections()
    proxy.close()
  })

  beforeEach(() => {
    requests = []
    proxyRequests = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
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

  test('never routes through a proxy', () => {
    const options = createWebhookHttpOptions({ timeoutMs: 2_000, allowPrivateAddresses: false })

    expect(options.proxy).toBe(false)
    // Node's global agents turn proxy-aware under NODE_USE_ENV_PROXY; dedicated agents do not.
    expect(options.httpAgent).not.toBe(http.globalAgent)
    expect(options.httpsAgent).not.toBe(https.globalAgent)
    const agentOptions = (agent: http.Agent) => (agent as unknown as { options: { proxyEnv?: unknown } }).options
    expect(agentOptions(options.httpAgent).proxyEnv).toBeUndefined()
    expect(agentOptions(options.httpsAgent).proxyEnv).toBeUndefined()
  })

  // A proxy resolves and connects to the destination itself, outside the `lookup` policy check.
  test('connects directly to the validated address when proxy environment variables are set', async () => {
    const proxyUrl = `http://127.0.0.1:${proxyPort}`
    vi.stubEnv('HTTP_PROXY', proxyUrl)
    vi.stubEnv('http_proxy', proxyUrl)
    vi.stubEnv('HTTPS_PROXY', proxyUrl)
    vi.stubEnv('https_proxy', proxyUrl)
    vi.stubEnv('NO_PROXY', '')
    vi.stubEnv('no_proxy', '')
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never)

    const response = await client().post(`http://sink.example.invalid:${port}/hook`, { event: 'test' })

    expect(response.status).toBe(200)
    expect(response.data).toBe('ok')
    expect(requests).toEqual(['POST /hook'])
    expect(proxyRequests).toEqual([])
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
