import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { AuthModule } from 'common/auth'

import { NotificationEventsListener } from './notification-events.listener'
import { NotificationGateway } from './notification.gateway'
import { NotificationService } from './notification.service'

@Module({
  imports: [AgentModule, AuthModule, HttpModule],
  providers: [NotificationGateway, NotificationService, NotificationEventsListener],
})
export class NotificationModule {}
