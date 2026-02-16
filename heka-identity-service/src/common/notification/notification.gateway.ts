import { IncomingMessage } from 'http'

import { MikroORM, UseRequestContext } from '@mikro-orm/core'
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets'
import WebSocket from 'ws'

import { AuthInfo, AuthService } from 'common/auth'
import { InjectLogger, Logger } from 'common/logger'
import { throwError } from 'utils/common'

import { NotificationDto } from './dto'

@WebSocketGateway({ path: 'notifications' })
export class NotificationGateway implements OnGatewayConnection {
  private connectedSockets: Map<string, WebSocket> = new Map<string, WebSocket>()

  public constructor(
    private readonly authService: AuthService,
    // @ts-ignore: The property is used by @UseRequestContext
    // See https://mikro-orm.io/docs/identity-map#userequestcontext-decorator
    private readonly orm: MikroORM,
    @InjectLogger(NotificationGateway)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @UseRequestContext()
  public async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const logger = this.logger.child('handleConnection', { request })
    logger.trace('>')

    // Here we need to validate token manually as AuthGuard will not work inside this method
    // See https://github.com/nestjs/nest/issues/882
    let authInfo: AuthInfo
    try {
      authInfo = await this.authService.validateRequestToken(request)
    } catch (error) {
      logger.error({ error }, 'Token validation error')
      socket.close(3000, 'Unauthorized')
      return
    }
    logger.traceObject({ authInfo })

    const { userId } = authInfo

    logger.debug(`Connecting WebSocket for user id: ${userId}`)

    this.connectedSockets.set(userId, socket)
    socket.onclose = (event) => {
      logger.debug({ event }, `Closing WebSocket for user id: ${userId}`)
      this.connectedSockets.delete(userId)
    }

    logger.trace('<')
  }

  public send(userId: string, notification: NotificationDto) {
    const logger = this.logger.child('send', { userId, notification })
    logger.trace('>')

    const recipientSocket = this.connectedSockets.get(userId) ?? throwError('Recipient socket is not connected')
    logger.trace({ recipientSocket })

    recipientSocket.send(JSON.stringify(notification))
    logger.trace('<')
  }
}
