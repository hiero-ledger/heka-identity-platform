import { Module } from '@nestjs/common'

import { agentModulesProvider } from './agent-modules.provider'
import { agentProvider, AGENT_TOKEN } from './agent.provider'
import { MediatorService } from './mediator.service'

@Module({
  providers: [agentModulesProvider, agentProvider, MediatorService],
  exports: [AGENT_TOKEN],
})
export class AgentModule {}
