import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { ContributorOnboardingModule } from 'contributor-onboarding'
import { OpenId4VcIssuanceSessionModule } from 'openid4vc/issuance-sessions/issuance-session.module'
import { OpenId4VcIssuerModule } from 'openid4vc/issuer/issuer.module'

import { ContributorCredentialController } from './contributor-credential.controller'
import { ContributorCredentialService } from './contributor-credential.service'

/** The contributor credential (SD-JWT VC over OID4VCI), offered from the caller's verified binding. */
@Module({
  imports: [AgentModule, ContributorOnboardingModule, OpenId4VcIssuerModule, OpenId4VcIssuanceSessionModule],
  controllers: [ContributorCredentialController],
  providers: [ContributorCredentialService],
  exports: [ContributorCredentialService],
})
export class ContributorCredentialModule {}
