import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { X509SigningModule } from 'x509-signing'

import { OpenId4VcVerificationSessionController } from './verification-session.controller'
import { OpenId4VcVerificationSessionService } from './verification-session.service'

@Module({
  imports: [AgentModule, X509SigningModule],
  controllers: [OpenId4VcVerificationSessionController],
  providers: [OpenId4VcVerificationSessionService],
  exports: [OpenId4VcVerificationSessionService],
})
export class OpenId4VcVerificationSessionModule {}
