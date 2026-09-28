import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { ContributorBinding } from 'contributor-onboarding'
import { OpenId4VcIssuerModule } from 'openid4vc/issuer/issuer.module'

import { ContributorCredentialController } from './contributor-credential.controller'
import { ContributorCredentialService } from './contributor-credential.service'

@Module({
  imports: [AgentModule, OpenId4VcIssuerModule, MikroOrmModule.forFeature([ContributorBinding])],
  controllers: [ContributorCredentialController],
  providers: [ContributorCredentialService],
  exports: [ContributorCredentialService],
})
export class ContributorCredentialModule {}
