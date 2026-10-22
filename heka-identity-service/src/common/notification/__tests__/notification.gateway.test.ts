import { IncomingMessage } from 'http'

import { createMock } from '@golevelup/ts-vitest'
import { EntityManager, MikroORM } from '@mikro-orm/core'
import { UnauthorizedException } from '@nestjs/common'
import WebSocket from 'ws'

import { AuthInfo, AuthService } from 'common/auth'
import { Logger } from 'common/logger'

import { NotificationDto } from '../dto'
import {
  NotificationGateway,
  selectNotificationProtocol,
  TOKEN_EXPIRED_CLOSE_CODE,
  UNAUTHORIZED_CLOSE_CODE,
} from '../notification.gateway'

interface FakeSocket {
  readyState: number
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  emitClose: () => void
}

const makeSocket = (): FakeSocket => {
  let onClose: ((code: number) => void) | undefined
  const socket: FakeSocket = {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, handler: (code: number) => void) => {
      if (event === 'close') onClose = handler
    }),
    emitClose: () => {
      socket.readyState = WebSocket.CLOSED
      onClose?.(1000)
    },
  }
  return socket
}

const request = { url: '/notifications', headers: {} } as IncomingMessage
const notification = {
  id: 'cred-1',
  type: 'DidCommCredentialStateChanged',
  state: 'done',
} as unknown as NotificationDto

describe('NotificationGateway', () => {
  let authService: AuthService
  let gateway: NotificationGateway

  const authenticateAs = (userId: string, expiresAt?: number) =>
    vi.mocked(authService.validateWebSocketToken).mockResolvedValue({
      authInfo: { userId } as AuthInfo,
      expiresAt,
    })

  const connect = async (userId: string, expiresAt?: number) => {
    authenticateAs(userId, expiresAt)
    const socket = makeSocket()
    await gateway.handleConnection(socket as unknown as WebSocket, request)
    return socket
  }

  // @CreateRequestContext checks `orm instanceof MikroORM` and forks its EntityManager per call
  const makeOrm = (): MikroORM => {
    const em = Object.assign(Object.create(EntityManager.prototype) as EntityManager, { name: 'default' })
    Object.assign(em, { fork: () => em })
    return Object.assign(Object.create(MikroORM.prototype) as MikroORM, { em })
  }

  beforeEach(() => {
    authService = createMock<AuthService>()
    gateway = new NotificationGateway(authService, makeOrm(), createMock<Logger>())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('selects only the bearer marker as subprotocol, never the token', () => {
    expect(selectNotificationProtocol(new Set(['heka.bearer', 'eyJ.token.sig']))).toBe('heka.bearer')
    expect(selectNotificationProtocol(new Set(['chat']))).toBe(false)
  })

  test('closes an unauthenticated socket with 3000', async () => {
    vi.mocked(authService.validateWebSocketToken).mockRejectedValue(new UnauthorizedException())
    const socket = makeSocket()

    await gateway.handleConnection(socket as unknown as WebSocket, request)

    expect(socket.close).toHaveBeenCalledWith(UNAUTHORIZED_CLOSE_CODE, 'Unauthorized')
    gateway.send('11', notification)
    expect(socket.send).not.toHaveBeenCalled()
  })

  test('delivers to every socket of the user and only to that user', async () => {
    const tab1 = await connect('11')
    const tab2 = await connect('11')
    const otherUser = await connect('22')

    gateway.send('11', notification)

    expect(tab1.send).toHaveBeenCalledWith(JSON.stringify(notification))
    expect(tab2.send).toHaveBeenCalledWith(JSON.stringify(notification))
    expect(otherUser.send).not.toHaveBeenCalled()
  })

  test('closing one tab keeps the other subscribed', async () => {
    const tab1 = await connect('11')
    const tab2 = await connect('11')

    tab1.emitClose()
    gateway.send('11', notification)

    expect(tab1.send).not.toHaveBeenCalled()
    expect(tab2.send).toHaveBeenCalledTimes(1)
  })

  test('does not throw when the user has no socket', () => {
    expect(() => gateway.send('nobody', notification)).not.toThrow()
  })

  test('closes the socket with 4001 when the token expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'))
    const expiresAt = Math.floor(Date.now() / 1000) + 60

    const socket = await connect('11', expiresAt)
    expect(socket.close).not.toHaveBeenCalled()

    vi.advanceTimersByTime(60_000)

    expect(socket.close).toHaveBeenCalledWith(TOKEN_EXPIRED_CLOSE_CODE, 'Token expired')
  })

  test('closes immediately when the token is already expired', async () => {
    const socket = await connect('11', Math.floor(Date.now() / 1000) - 1)

    expect(socket.close).toHaveBeenCalledWith(TOKEN_EXPIRED_CLOSE_CODE, 'Token expired')
  })

  test('does not register a socket that closed during authentication', async () => {
    authenticateAs('11')
    const socket = makeSocket()
    socket.readyState = WebSocket.CLOSED

    await gateway.handleConnection(socket as unknown as WebSocket, request)
    gateway.send('11', notification)

    expect(socket.send).not.toHaveBeenCalled()
  })
})
