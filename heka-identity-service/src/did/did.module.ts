import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { DidRegistrarModule } from 'common/did-registrar'
import { WalletLockModule } from 'common/wallet-lock'

import { DidController } from './did.controller'
import { DidService } from './did.service'

@Module({
  imports: [AgentModule, DidRegistrarModule, WalletLockModule],
  controllers: [DidController],
  providers: [DidService],
  exports: [DidService],
})
export class DidModule {}
