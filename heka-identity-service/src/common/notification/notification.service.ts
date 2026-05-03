import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import * as net from 'net'

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

  private isPrivateIP(host: string): boolean {
    if (net.isIP(host)) {
      return (
        host.startsWith('10.') ||
        host.startsWith('127.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
      )
    }

    return host === 'localhost'
  }

  private validateWebhookUrl(url: string): URL {
    const parsed = new URL(url)

    // Enforce HTTPS
    if (parsed.protocol !== 'https:') {
      throw new Error('Only HTTPS webhook URLs are allowed')
    }

    // Block internal/private addresses
    if (this.isPrivateIP(parsed.hostname)) {
      throw new Error('Webhook URL points to a private/internal address')
    }

    return parsed
  }

  private async sendWebhookNotification(webHook: string, notification: NotificationDto) {
    const parsedUrl = this.validateWebhookUrl(webHook)

    return this.httpService.axiosRef.post(parsedUrl.toString(), notification, {
      timeout: 5000,            // ⏱️ prevent hanging requests
      maxRedirects: 0,          // 🚫 prevent redirect-based SSRF
      maxContentLength: 1024 * 1024, // 📦 limit response size (1MB)
      validateStatus: (status) => status < 400,
    })
  }

  private async sendNotification(user: User, notification: NotificationDto) {
    const { messageDeliveryType, webHook: userWebHook } = user

    if (messageDeliveryType === MessageDeliveryType.WebHook) {
      const webHook =
        userWebHook ??
        throwError('User web hook is missing, but required for WebHook delivery method')

      await this.sendWebhookNotification(webHook, notification)
    } else {
      // Default: WebSocket delivery
      this.notificationGateway.send(user.id, notification)
    }
  }
}