import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { DidRegistrarModule } from 'common/did-registrar'

import { DidController } from './did.controller'
import { DidService } from './did.service'

@Module({
  imports: [AgentModule, DidRegistrarModule],
  controllers: [DidController],
  providers: [DidService],
  exports: [DidService],
})
export class DidModule {}
