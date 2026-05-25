import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { URL } from 'url'
import { isIP } from 'net'
import { lookup } from 'dns/promises'

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

  // CWE-918: Prevent SSRF — block private IPs, metadata endpoints, non-HTTPS
  private async validateWebhookUrl(webhookUrl: string): Promise<void> {
    const parsed = new URL(webhookUrl)
    if (parsed.protocol !== 'https:') {
      throw new Error('Webhook URL must use HTTPS')
    }
    const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal']
    if (BLOCKED_HOSTS.includes(parsed.hostname)) {
      throw new Error('Webhook URL points to a blocked host')
    }
    const BLOCKED_CIDRS = ['10.', '172.16.', '172.17.', '172.18.', '172.19.',
      '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
      '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
      '192.168.', '169.254.']
    const resolved = await lookup(parsed.hostname)
    if (BLOCKED_CIDRS.some(cidr => resolved.address.startsWith(cidr))) {
      throw new Error('Webhook URL resolves to a private IP address')
    }
  }

  private async sendNotification(user: User, notification: NotificationDto) {
    const { messageDeliveryType, webHook: userWebHook } = user

    if (messageDeliveryType === MessageDeliveryType.WebHook) {
      const webHook = userWebHook ?? throwError('User web hook is missing, but required for WebHook delivery method')
      await this.validateWebhookUrl(webHook)
      await this.httpService.axiosRef.post(webHook, notification, {
        timeout: 10000,
        maxRedirects: 0,
      })
    } else {
      // By default, send notification via WebSocket
      this.notificationGateway.send(user.id, notification)
    }
  }
}
