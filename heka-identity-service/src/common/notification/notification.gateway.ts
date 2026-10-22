import { IncomingMessage } from 'http'

import { MikroORM } from '@mikro-orm/core'
import { CreateRequestContext } from '@mikro-orm/decorators/legacy'
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets'
import WebSocket from 'ws'

import { AuthInfo, AuthService, WEBSOCKET_BEARER_PROTOCOL } from 'common/auth'
import { InjectLogger, Logger } from 'common/logger'

import { NotificationDto } from './dto'

export const UNAUTHORIZED_CLOSE_CODE = 3000
export const TOKEN_EXPIRED_CLOSE_CODE = 4001

// setTimeout fires immediately for delays above 2^31 - 1 ms
const MAX_TIMER_DELAY_MS = 2_147_483_647

/**
 * Selects the bearer marker as the connection's subprotocol. The token that follows it in the
 * client's list must never be echoed back. Clients that send no subprotocols never reach this.
 */
export function selectNotificationProtocol(protocols: Set<string>): string | false {
  return protocols.has(WEBSOCKET_BEARER_PROTOCOL) ? WEBSOCKET_BEARER_PROTOCOL : false
}

@WebSocketGateway({ path: 'notifications', handleProtocols: selectNotificationProtocol })
export class NotificationGateway implements OnGatewayConnection {
  // A user can have several tabs open, each with its own socket
  private connectedSockets: Map<string, Set<WebSocket>> = new Map<string, Set<WebSocket>>()

  public constructor(
    private readonly authService: AuthService,
    // @ts-expect-error: The property is used by @CreateRequestContext
    // See https://mikro-orm.io/docs/identity-map#createrequestcontext-decorator
    private readonly orm: MikroORM,
    @InjectLogger(NotificationGateway)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @CreateRequestContext()
  public async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    // The upgrade request carries the access token, so only its URL is logged
    const logger = this.logger.child('handleConnection', { url: request.url })
    logger.trace('>')

    // Here we need to validate token manually as AuthGuard will not work inside this method
    // See https://github.com/nestjs/nest/issues/882
    let authInfo: AuthInfo
    let expiresAt: number | undefined
    try {
      ;({ authInfo, expiresAt } = await this.authService.validateWebSocketToken(request))
    } catch (error) {
      logger.warn({ error: (error as Error)?.message }, 'Token validation error')
      socket.close(UNAUTHORIZED_CLOSE_CODE, 'Unauthorized')
      return
    }

    // The client may have gone away while the token was being validated
    if (socket.readyState !== WebSocket.OPEN) {
      logger.trace('< socket closed during authentication')
      return
    }

    const { userId } = authInfo
    logger.debug(`Connecting WebSocket for user id: ${userId}`)

    let sockets = this.connectedSockets.get(userId)
    if (!sockets) {
      sockets = new Set<WebSocket>()
      this.connectedSockets.set(userId, sockets)
    }
    sockets.add(socket)

    const expiryTimer = this.scheduleExpiry(socket, expiresAt)

    socket.on('close', (code: number) => {
      logger.debug({ code }, `Closing WebSocket for user id: ${userId}`)
      if (expiryTimer) clearTimeout(expiryTimer)
      const userSockets = this.connectedSockets.get(userId)
      userSockets?.delete(socket)
      if (userSockets?.size === 0) this.connectedSockets.delete(userId)
    })

    logger.trace('<')
  }

  public send(userId: string, notification: NotificationDto) {
    const logger = this.logger.child('send', { userId, notification })
    logger.trace('>')

    const sockets = this.connectedSockets.get(userId)
    if (!sockets?.size) {
      // Most users have no UI open; that is not a delivery failure
      logger.debug('No WebSocket connected for user')
      return
    }

    const message = JSON.stringify(notification)
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message)
    }
    logger.trace('<')
  }

  private scheduleExpiry(socket: WebSocket, expiresAt?: number): NodeJS.Timeout | undefined {
    if (expiresAt === undefined) return undefined

    const delayMs = expiresAt * 1000 - Date.now()
    if (delayMs <= 0) {
      socket.close(TOKEN_EXPIRED_CLOSE_CODE, 'Token expired')
      return undefined
    }
    return setTimeout(
      () => socket.close(TOKEN_EXPIRED_CLOSE_CODE, 'Token expired'),
      Math.min(delayMs, MAX_TIMER_DELAY_MS),
    )
  }
}
