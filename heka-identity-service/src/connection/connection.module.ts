import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { UserModule } from '../user'

import { ConnectionController } from './connection.controller'
import { ConnectionService } from './connection.service'

@Module({
  imports: [AgentModule, UserModule],
  controllers: [ConnectionController],
  providers: [ConnectionService],
})
export class ConnectionModule {}
