import { HttpService } from '@nestjs/axios'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { isAxiosError } from 'axios'

import { User } from 'common/entities'
import { MessageDeliveryType } from 'common/entities/user.entity'
import { InjectLogger, Logger } from 'common/logger'
import { WebhookEgressService, WebhookTargetPolicyError } from 'common/webhook'
import WebhookConfig from 'config/webhook'
import { throwError } from 'utils/common'

import { NotificationDto } from './dto'
import { NotificationGateway } from './notification.gateway'

@Injectable()
export class NotificationService {
  public constructor(
    private readonly httpService: HttpService,
    private readonly webhookEgress: WebhookEgressService,
    private readonly notificationGateway: NotificationGateway,
    @Inject(WebhookConfig.KEY)
    private readonly webhookConfig: ConfigType<typeof WebhookConfig>,
    @InjectLogger(NotificationService)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public async trySendNotification(user: User, notification: NotificationDto): Promise<boolean> {
    // Bind identifiers only: the entity carries the webhook URL, which can embed secrets.
    const logger = this.logger.child('trySendNotification', {
      user: { id: user.id, messageDeliveryType: user.messageDeliveryType },
      notification,
    })

    try {
      await this.sendNotification(user, notification)
    } catch (error) {
      logger.error(
        { error: deliveryErrorForLog(error), reason: deliveryFailureReason(error) },
        'Notification delivery failed',
      )
      return false
    }

    return true
  }

  private async sendNotification(user: User, notification: NotificationDto) {
    const { messageDeliveryType, webHook: userWebHook } = user

    if (messageDeliveryType === MessageDeliveryType.WebHook) {
      const webHook = userWebHook ?? throwError('User web hook is missing, but required for WebHook delivery method')
      // Stored URLs are re-validated on every send: the policy may have changed and DNS answers may have moved.
      await this.webhookEgress.assertCallbackUrlAllowed(webHook)
      await this.httpService.axiosRef.post(webHook, notification, {
        // `timeout` is idle-based; the signal adds a wall-clock deadline for the whole request.
        signal: AbortSignal.timeout(this.webhookConfig.timeoutMs),
      })
    } else {
      // By default, send notification via WebSocket
      this.notificationGateway.send(user.id, notification)
    }
  }
}

/** Makes a policy rejection distinguishable from a timeout or a plain delivery error in the logs. */
function deliveryFailureReason(error: unknown): string {
  if (error instanceof WebhookTargetPolicyError) return `policy:${error.policyCode}`

  const code = (error as { code?: string } | undefined)?.code
  if (code === 'ERR_CANCELED' || code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'timeout'

  return code ?? 'error'
}

/**
 * Raw delivery errors can carry the webhook URL (Axios errors serialize their request config; Node's
 * ERR_INVALID_URL keeps the rejected string in `input`), so log only the fields needed for diagnosis.
 */
function deliveryErrorForLog(error: unknown): Record<string, unknown> {
  if (isAxiosError(error)) {
    return { name: error.name, message: error.message, code: error.code, status: error.response?.status }
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message, code: (error as NodeJS.ErrnoException).code }
  }
  return { type: typeof error }
}
