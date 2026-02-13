import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'

import { User } from 'common/entities'
import { MessageDeliveryType } from 'common/entities/user.entity'
import { InjectLogger, Logger } from 'common/logger'
import { throwError } from 'utils/common'

import { NotificationDto } from './dto'
import { NotificationGateway } from './notification.gateway'

@Injectable()
export class NotificationService {
  public constructor(
    private readonly httpService: HttpService,
    private readonly notificationGateway: NotificationGateway,
    @InjectLogger(NotificationService)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public async trySendNotification(user: User, notification: NotificationDto): Promise<boolean> {
    const logger = this.logger.child('trySendNotification', { user, notification })

    try {
      await this.sendNotification(user, notification)
    } catch (error) {
      logger.error({ error }, 'Notification delivery failed')
      return false
    }

    return true
  }

  private async sendNotification(user: User, notification: NotificationDto) {
    const { messageDeliveryType, webHook: userWebHook } = user

    if (messageDeliveryType === MessageDeliveryType.WebHook) {
      const webHook = userWebHook ?? throwError('User web hook is missing, but required for WebHook delivery method')
      await this.httpService.axiosRef.post(webHook, notification)
    } else {
      // By default, send notification via WebSocket
      this.notificationGateway.send(user.id, notification)
    }
  }
}
