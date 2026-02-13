import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { ProofController } from './proof.controller'
import { ProofService } from './proof.service'

@Module({
  imports: [AgentModule],
  controllers: [ProofController],
  providers: [ProofService],
  exports: [ProofService],
})
export class ProofModule {}
