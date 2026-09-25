import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigType } from '@nestjs/config'

import { AgentModule } from 'common/agent'
import { AuthModule } from 'common/auth'
import { createWebhookHttpOptions, WebhookModule } from 'common/webhook'
import WebhookConfig from 'config/webhook'

import { NotificationEventsListener } from './notification-events.listener'
import { NotificationGateway } from './notification.gateway'
import { NotificationService } from './notification.service'

@Module({
  imports: [
    AgentModule,
    AuthModule,
    WebhookModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [WebhookConfig.KEY],
      useFactory: (config: ConfigType<typeof WebhookConfig>) => createWebhookHttpOptions(config),
    }),
  ],
  providers: [NotificationGateway, NotificationService, NotificationEventsListener],
})
export class NotificationModule {}
