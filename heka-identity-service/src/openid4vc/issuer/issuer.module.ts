import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { OpenId4VcIssuerController } from './issuer.controller'
import { OpenId4VcIssuerService } from './issuer.service'

@Module({
  imports: [AgentModule],
  controllers: [OpenId4VcIssuerController],
  providers: [OpenId4VcIssuerService],
  exports: [OpenId4VcIssuerService],
})
export class OpenId4VcIssuerModule {}
