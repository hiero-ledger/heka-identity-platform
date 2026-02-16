import { Module } from '@nestjs/common'

import { AgentModule } from '../agent'

import { DidRegistrarService } from './did-registrar.service'

@Module({
  imports: [AgentModule],
  providers: [DidRegistrarService],
  exports: [DidRegistrarService],
})
export class DidRegistrarModule {}
