import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { DidModule } from 'did'

import { OpenId4VcVerifierController } from './verifier.controller'
import { OpenId4VcVerifierService } from './verifier.service'

@Module({
  imports: [AgentModule, DidModule],
  controllers: [OpenId4VcVerifierController],
  providers: [OpenId4VcVerifierService],
  exports: [OpenId4VcVerifierService],
})
export class OpenId4VcVerifierModule {}
