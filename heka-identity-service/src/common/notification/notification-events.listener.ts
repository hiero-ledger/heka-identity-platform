import { DidCommConnectionEventTypes, DidCommCredentialEventTypes, DidCommProofEventTypes } from '@credo-ts/didcomm'
import { OpenId4VcVerifierEvents, OpenId4VcIssuerEvents } from '@credo-ts/openid4vc'
import { EntityManager, MikroORM } from '@mikro-orm/core'
import { CreateRequestContext } from '@mikro-orm/decorators/legacy'
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { Wallet } from 'common/entities'
import { InjectLogger, Logger } from 'common/logger'

import {
  ConnectionStateChangeDto,
  CredentialStateChangeDto,
  NotificationDto,
  OpenidIssueStateChangeDto,
  OpenidVerifierStateChangeDto,
  ProofStateChangeDto,
} from './dto'
import { NotificationService } from './notification.service'
import { NotificationEvent, NotificationEventType } from './notification.types'

const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  ...Object.values(DidCommConnectionEventTypes),
  ...Object.values(DidCommCredentialEventTypes),
  ...Object.values(DidCommProofEventTypes),
  ...Object.values(OpenId4VcIssuerEvents),
  ...Object.values(OpenId4VcVerifierEvents),
]

@Injectable()
export class NotificationEventsListener implements OnModuleInit, OnModuleDestroy {
  private readonly eventNotificationHandler = this.sendEventNotification.bind(this)
  private isSubscribed = false

  public constructor(
    @Inject(AGENT_TOKEN)
    private readonly agent: Agent,
    private readonly notificationService: NotificationService,
    // @ts-ignore: The property is used by @CreateRequestContext
    // See https://mikro-orm.io/docs/identity-map#createrequestcontext-decorator
    private readonly orm: MikroORM,
    private readonly em: EntityManager,
    @InjectLogger(NotificationEventsListener)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public onModuleInit() {
    if (this.isSubscribed) {
      this.logger.warn('Notification event listeners are already registered, skipping duplicate registration')
      return
    }

    for (const eventType of NOTIFICATION_EVENT_TYPES) {
      this.agent.events.on(eventType, this.eventNotificationHandler)
    }
    this.isSubscribed = true
  }

  public onModuleDestroy() {
    if (!this.isSubscribed) {
      return
    }

    for (const eventType of NOTIFICATION_EVENT_TYPES) {
      this.agent.events.off(eventType, this.eventNotificationHandler)
    }
    this.isSubscribed = false
  }

  @CreateRequestContext()
  private async sendEventNotification(event: NotificationEvent) {
    const logger = this.logger.child('sendEventNotification', { event })
    logger.trace('>')

    const tenantId = event.metadata.contextCorrelationId.replace('tenant-', '')

    const wallet = await this.em.findOne(Wallet, { tenantId }, { populate: ['users'] })
    if (!wallet) {
      logger.warn(`Wallet entity not found for tenant id: ${tenantId}`)
      return
    }

    const notificationDto = this.getEventNotificationDto(event)

    await Promise.all(
      wallet.users.getItems().map((user) => this.notificationService.trySendNotification(user, notificationDto)),
    )

    logger.trace('<')
  }

  private getEventNotificationDto(event: NotificationEvent): NotificationDto {
    switch (event.type) {
      case DidCommConnectionEventTypes.DidCommConnectionDidRotated:
      case DidCommConnectionEventTypes.DidCommConnectionStateChanged: {
        return new ConnectionStateChangeDto(event)
      }
      case DidCommCredentialEventTypes.DidCommCredentialStateChanged:
      case DidCommCredentialEventTypes.DidCommRevocationNotificationReceived: {
        return new CredentialStateChangeDto(event)
      }
      case DidCommProofEventTypes.ProofStateChanged: {
        return new ProofStateChangeDto(event)
      }
      case OpenId4VcIssuerEvents.IssuanceSessionStateChanged: {
        return new OpenidIssueStateChangeDto(event)
      }
      case OpenId4VcVerifierEvents.VerificationSessionStateChanged: {
        return new OpenidVerifierStateChangeDto(event)
      }
      default: {
        throw new Error(`Unknown event type: ${(event as { type: string }).type}`)
      }
    }
  }
}
