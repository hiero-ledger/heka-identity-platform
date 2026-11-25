import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { DidModule } from 'did'

import { OpenId4VcIssuerController } from './issuer.controller'
import { OpenId4VcIssuerService } from './issuer.service'

@Module({
  imports: [AgentModule, DidModule],
  controllers: [OpenId4VcIssuerController],
  providers: [OpenId4VcIssuerService],
  exports: [OpenId4VcIssuerService],
})
export class OpenId4VcIssuerModule {}
