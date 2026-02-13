import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { OpenId4VcStarterService } from './starter.service'

@Module({
  imports: [AgentModule],
  providers: [OpenId4VcStarterService],
})
export class OpenId4VcStarterModule {}
