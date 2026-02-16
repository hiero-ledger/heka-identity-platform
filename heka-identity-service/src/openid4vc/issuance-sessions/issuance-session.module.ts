import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { RevocationModule } from '../../revocation'

import { OpenId4VcIssuanceSessionController } from './issuance-session.controller'
import { OpenId4VcIssuanceSessionService } from './issuance-session.service'

@Module({
  imports: [AgentModule, RevocationModule],
  controllers: [OpenId4VcIssuanceSessionController],
  providers: [OpenId4VcIssuanceSessionService],
  exports: [OpenId4VcIssuanceSessionService],
})
export class OpenId4VcIssuanceSessionModule {}
