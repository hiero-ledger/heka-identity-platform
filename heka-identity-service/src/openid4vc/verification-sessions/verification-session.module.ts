import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { OpenId4VcVerificationSessionController } from './verification-session.controller'
import { OpenId4VcVerificationSessionService } from './verification-session.service'

@Module({
  imports: [AgentModule],
  controllers: [OpenId4VcVerificationSessionController],
  providers: [OpenId4VcVerificationSessionService],
  exports: [OpenId4VcVerificationSessionService],
})
export class OpenId4VcVerificationSessionModule {}
