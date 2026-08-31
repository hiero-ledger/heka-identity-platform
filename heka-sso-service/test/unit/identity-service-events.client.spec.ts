import { AddressInfo } from 'node:net'

import WebSocket, { WebSocketServer } from 'ws'

import { ConfigService, OidcConfig } from '../../src/core/config'
import {
  IdentityServiceEventsClient,
  IdentityServiceTokenProvider,
  VerificationSessionEvent,
  VerificationSessionState,
} from '../../src/oidc'

const waitFor = async <T>(probe: () => T | undefined, what: string, timeoutMs = 2000): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = probe()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * Server-side subscription to heka-identity-service's notification gateway: 
 * bearer-authenticated connect, verifier-event filtering, reconnect
 * with backoff, token invalidation on an unauthorized close.
 */
describe('IdentityServiceEventsClient', () => {
  let server: WebSocketServer
  let port: number
  /** Connections the fake gateway accepted, newest last. */
  let connections: { socket: WebSocket; authorization?: string }[]

  let client: IdentityServiceEventsClient
  let tokens: IdentityServiceTokenProvider
  let events: VerificationSessionEvent[]

  beforeEach(async () => {
    connections = []
    events = []
    server = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/notifications' })
    server.on('connection', (socket, request) => {
      connections.push({ socket, authorization: request.headers.authorization })
    })
    await new Promise<void>((resolve) => server.on('listening', resolve))
    port = (server.address() as AddressInfo).port

    const config = new OidcConfig({
      OIDC_SUB_HMAC_SALT: 'unit-test-sub-hmac-salt-0123456789abcdef',
      IDENTITY_SERVICE_BASE_URL: `http://127.0.0.1:${port}`,
      IDENTITY_SERVICE_AUTH_TOKEN: 'identity-token',
    })
    const configService = { oidcConfig: config } as unknown as ConfigService
    tokens = new IdentityServiceTokenProvider(configService)
    client = new IdentityServiceEventsClient(configService, tokens)
    client.reconnectBaseMs = 10
    client.reconnectMaxMs = 50
  })

  afterEach(async () => {
    client.stop()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const verifierEvent = (sessionId: string, state: string, errorMessage?: string) =>
    JSON.stringify({
      type: 'OpenId4VcVerifier.VerificationSessionStateChanged',
      verificationSession: { id: sessionId, state, errorMessage },
      previousState: 'RequestCreated',
    })

  test('connects with the bearer token and forwards verification-session events', async () => {
    client.start((event) => events.push(event))
    const connection = await waitFor(() => connections[0], 'gateway connection')
    expect(connection.authorization).toBe('Bearer identity-token')

    connection.socket.send(verifierEvent('vs-9', 'ResponseVerified'))
    const received = await waitFor(() => events[0], 'forwarded event')
    expect(received).toEqual({
      sessionId: 'vs-9',
      state: VerificationSessionState.ResponseVerified,
      errorMessage: undefined,
    })
  })

  test('ignores non-verifier notifications and malformed frames', async () => {
    client.start((event) => events.push(event))
    const connection = await waitFor(() => connections[0], 'gateway connection')

    connection.socket.send(JSON.stringify({ type: 'CredentialStateChanged', credential: { id: 'c-1' } }))
    connection.socket.send('not-json')
    connection.socket.send(verifierEvent('vs-1', 'Error', 'nonce mismatch'))

    const received = await waitFor(() => events[0], 'forwarded event')
    expect(received).toEqual({
      sessionId: 'vs-1',
      state: VerificationSessionState.Error,
      errorMessage: 'nonce mismatch',
    })
    expect(events).toHaveLength(1)
  })

  test('reconnects after the connection drops — push keeps working', async () => {
    client.start((event) => events.push(event))
    const first = await waitFor(() => connections[0], 'first connection')

    first.socket.close()
    const second = await waitFor(() => connections[1], 'reconnected connection')
    second.socket.send(verifierEvent('vs-2', 'ResponseVerified'))
    await waitFor(() => events[0], 'event after reconnect')
  })

  test('an unauthorized close (3000) drops the cached token before reconnecting', async () => {
    const invalidate = vi.spyOn(tokens, 'invalidate')
    client.start((event) => events.push(event))
    const first = await waitFor(() => connections[0], 'first connection')

    first.socket.close(3000, 'Unauthorized')
    await waitFor(() => (invalidate.mock.calls.length > 0 ? true : undefined), 'token invalidation')
    await waitFor(() => connections[1], 'reconnect after unauthorized close')
  })

  test('stop() ends the subscription — no further reconnects', async () => {
    client.start((event) => events.push(event))
    const first = await waitFor(() => connections[0], 'first connection')

    client.stop()
    first.socket.close()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(connections).toHaveLength(1)
  })
})
