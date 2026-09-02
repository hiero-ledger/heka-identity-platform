import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'

import Keygrip from 'keygrip'
import WebSocket from 'ws'

import { ConfigService, OidcConfig } from '../../src/core/config'
import { LoginEventsService, VerificationSessionState } from '../../src/oidc'

const cookieKeys = ['unit-test-cookie-key-0123456789abcdef']
const keygrip = new Keygrip(cookieKeys)

/** A browser-equivalent signed interaction cookie (what node-oidc-provider sets on /authorize). */
const signedCookie = (uid: string) => {
  const pair = `_interaction=${uid}`
  return `${pair}; _interaction.sig=${keygrip.sign(pair)}`
}

const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * WebSocket push channel to the login page: cookie-bound upgrade on
 * /interaction/:uid/events, session→interaction routing, LoginStatus mapping.
 */
describe('LoginEventsService', () => {
  let server: Server
  let baseUrl: string
  let service: LoginEventsService
  const openSockets: WebSocket[] = []

  beforeAll(async () => {
    const config = new OidcConfig({
      OIDC_COOKIE_KEYS: cookieKeys.join(','),
      OIDC_SUB_HMAC_SALT: 'unit-test-sub-hmac-salt-0123456789abcdef',
    })
    service = new LoginEventsService({ oidcConfig: config } as unknown as ConfigService)

    server = createServer((_req, res) => res.end())
    service.attach(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    service.onModuleDestroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  afterEach(() => {
    for (const socket of openSockets.splice(0)) socket.close()
  })

  /** Opens a subscription and resolves once connected; rejects when the server refuses the upgrade. */
  const connect = (path: string, cookie?: string) =>
    new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`${baseUrl}${path}`, { headers: { ...(cookie && { cookie }) } })
      openSockets.push(socket)
      socket.on('open', () => resolve(socket))
      socket.on('error', (error) => reject(error))
      socket.on('unexpected-response', (_req, res) => reject(new Error(`upgrade refused: ${res.statusCode}`)))
    })

  const nextMessage = (socket: WebSocket) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('no push received')), 2000)
      socket.once('message', (data) => {
        clearTimeout(timeout)
        resolve(JSON.parse(String(data)))
      })
    })

  test('pushes verification-session state changes to the subscribed page', async () => {
    const socket = await connect('/interaction/uid-1/events', signedCookie('uid-1'))
    service.registerSession('vs-1', 'uid-1')

    const verified = nextMessage(socket)
    service.handleSessionEvent({ sessionId: 'vs-1', state: VerificationSessionState.ResponseVerified })
    expect(await verified).toEqual({ status: 'verified' })
  })

  test('maps the Error state to an error status with the session message', async () => {
    const socket = await connect('/interaction/uid-2/events', signedCookie('uid-2'))
    service.registerSession('vs-2', 'uid-2')

    const errored = nextMessage(socket)
    service.handleSessionEvent({
      sessionId: 'vs-2',
      state: VerificationSessionState.Error,
      errorMessage: 'presentation signature invalid',
    })
    expect(await errored).toEqual({ status: 'error', message: 'presentation signature invalid' })
  })

  test('intermediate states push pending', async () => {
    const socket = await connect('/interaction/uid-3/events', signedCookie('uid-3'))
    service.registerSession('vs-3', 'uid-3')

    const pending = nextMessage(socket)
    service.handleSessionEvent({ sessionId: 'vs-3', state: VerificationSessionState.RequestUriRetrieved })
    expect(await pending).toEqual({ status: 'pending' })
  })

  test('events for unregistered sessions go nowhere', async () => {
    const socket = await connect('/interaction/uid-4/events', signedCookie('uid-4'))
    service.registerSession('vs-4', 'uid-4')

    const messages: unknown[] = []
    socket.on('message', (data) => messages.push(JSON.parse(String(data))))

    service.handleSessionEvent({ sessionId: 'vs-unknown', state: VerificationSessionState.ResponseVerified })
    await waitMs(100)
    expect(messages).toEqual([])
  })

  test('binding rule: upgrades without a valid signed cookie are refused', async () => {
    // no cookie at all
    await expect(connect('/interaction/uid-5/events')).rejects.toThrow(/upgrade refused: 400|socket hang up/)
    // bad signature
    await expect(connect('/interaction/uid-5/events', '_interaction=uid-5; _interaction.sig=forged')).rejects.toThrow(
      /upgrade refused: 400|socket hang up/,
    )
    // valid cookie for a different interaction
    await expect(connect('/interaction/uid-5/events', signedCookie('uid-other'))).rejects.toThrow(
      /upgrade refused: 400|socket hang up/,
    )
  })

  test('upgrades outside /interaction/:uid/events are not served', async () => {
    await expect(connect('/somewhere-else', signedCookie('uid-6'))).rejects.toThrow(
      /upgrade refused: 404|socket hang up/,
    )
  })

  test('a malformed uid segment is refused without crashing the server (no decodeURIComponent throw)', async () => {
    // '%zz' is invalid percent-encoding and '%' is outside the uid alphabet — must fail the socket, not the process
    await expect(connect('/interaction/%zz/events', signedCookie('uid-8'))).rejects.toThrow(
      /upgrade refused: 404|socket hang up/,
    )
    // the server is still alive and serving upgrades
    const socket = await connect('/interaction/uid-8/events', signedCookie('uid-8'))
    expect(socket.readyState).toBe(WebSocket.OPEN)
  })

  test('a closed subscription is dropped — later events do not throw', async () => {
    const socket = await connect('/interaction/uid-7/events', signedCookie('uid-7'))
    service.registerSession('vs-7', 'uid-7')
    socket.close()
    await waitMs(50)
    // no subscriber left; must be a no-op
    service.handleSessionEvent({ sessionId: 'vs-7', state: VerificationSessionState.ResponseVerified })
  })
})
