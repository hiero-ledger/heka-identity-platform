import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'

import { AgentModule } from 'common/agent'

import { HealthController } from './health.controller'

@Module({
  imports: [TerminusModule, AgentModule],
  controllers: [HealthController],
})
export class HealthModule {}
