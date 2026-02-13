import { ConnectionEventTypes, CredentialEventTypes, ProofEventTypes } from '@credo-ts/didcomm'
import { OpenId4VcVerifierEvents } from '@credo-ts/openid4vc'
import { OpenId4VcIssuerEvents } from '@credo-ts/openid4vc/build/openid4vc-issuer/OpenId4VcIssuerEvents'
import { EntityManager, MikroORM, UseRequestContext } from '@mikro-orm/core'
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
  ...Object.values(ConnectionEventTypes),
  ...Object.values(CredentialEventTypes),
  ...Object.values(ProofEventTypes),
]

@Injectable()
export class NotificationEventsListener implements OnModuleInit, OnModuleDestroy {
  public constructor(
    @Inject(AGENT_TOKEN)
    private readonly agent: Agent,
    private readonly notificationService: NotificationService,
    // @ts-ignore: The property is used by @UseRequestContext
    // See https://mikro-orm.io/docs/identity-map#userequestcontext-decorator
    private readonly orm: MikroORM,
    private readonly em: EntityManager,
    @InjectLogger(NotificationEventsListener)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public onModuleInit() {
    for (const eventType of NOTIFICATION_EVENT_TYPES) {
      this.agent.events.on(eventType, this.sendEventNotification.bind(this))
    }
  }

  public onModuleDestroy() {
    for (const eventType of NOTIFICATION_EVENT_TYPES) {
      this.agent.events.off(eventType, this.sendEventNotification.bind(this))
    }
  }

  @UseRequestContext()
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
      case ConnectionEventTypes.ConnectionDidRotated:
      case ConnectionEventTypes.ConnectionStateChanged: {
        return new ConnectionStateChangeDto(event)
      }
      case CredentialEventTypes.CredentialStateChanged:
      case CredentialEventTypes.RevocationNotificationReceived: {
        return new CredentialStateChangeDto(event)
      }
      case ProofEventTypes.ProofStateChanged: {
        return new ProofStateChangeDto(event)
      }
      case OpenId4VcIssuerEvents.IssuanceSessionStateChanged: {
        return new OpenidIssueStateChangeDto(event)
      }
      case OpenId4VcVerifierEvents.VerificationSessionStateChanged: {
        return new OpenidVerifierStateChangeDto(event)
      }
    }
  }
}
