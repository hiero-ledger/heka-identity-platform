import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { OpenId4VcVerifierController } from './verifier.controller'
import { OpenId4VcVerifierService } from './verifier.service'

@Module({
  imports: [AgentModule],
  controllers: [OpenId4VcVerifierController],
  providers: [OpenId4VcVerifierService],
  exports: [OpenId4VcVerifierService],
})
export class OpenId4VcVerifierModule {}
