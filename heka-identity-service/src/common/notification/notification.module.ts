import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigType } from '@nestjs/config'

import { AgentModule } from 'common/agent'
import { AuthModule } from 'common/auth'
import { createWebhookHttpAgents } from 'common/webhook/webhook-http-agents'
import { WebhookModule } from 'common/webhook/webhook.module'
import WebhookNotificationsConfig from 'config/webhook-notifications'

import { NotificationEventsListener } from './notification-events.listener'
import { NotificationGateway } from './notification.gateway'
import { NotificationService } from './notification.service'

@Module({
  imports: [
    ConfigModule,
    WebhookModule,
    AgentModule,
    AuthModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigType<typeof WebhookNotificationsConfig>) => {
        const agents = createWebhookHttpAgents({
          dnsResolutionTimeoutMs: cfg.dnsResolutionTimeoutMs,
          allowInternalDnsNames: cfg.allowInternalDnsNames,
        })
        return {
          timeout: cfg.timeoutMs,
          maxRedirects: cfg.maxRedirects,
          maxContentLength: cfg.maxResponseBodyBytes,
          httpAgent: agents.httpAgent,
          httpsAgent: agents.httpsAgent,
        }
      },
      inject: [WebhookNotificationsConfig.KEY],
    }),
  ],
  providers: [NotificationGateway, NotificationService, NotificationEventsListener],
})
export class NotificationModule {}
