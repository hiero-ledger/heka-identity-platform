import { Module } from '@nestjs/common'

import { agentModulesProvider } from './agent-modules.provider'
import { agentProvider, AGENT_TOKEN } from './agent.provider'

@Module({
  providers: [agentModulesProvider, agentProvider],
  exports: [AGENT_TOKEN],
})
export class AgentModule {}
