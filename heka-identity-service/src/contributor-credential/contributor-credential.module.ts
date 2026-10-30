import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { ContributorOnboardingModule } from 'contributor-onboarding'
import { OpenId4VcIssuanceSessionModule } from 'openid4vc/issuance-sessions/issuance-session.module'
import { OpenId4VcIssuerModule } from 'openid4vc/issuer/issuer.module'

import { ContributorCredentialController } from './contributor-credential.controller'
import { ContributorCredentialService } from './contributor-credential.service'

/**
 * OID4VCI issuance for the GithubContributorCredential SD-JWT VC.
 *
 * Bootstraps the static issuer and exposes POST /v2/contributor-credential/offer.
 * The offer is built from the authenticated user's binding in this service.
 */
@Module({
  imports: [AgentModule, ContributorOnboardingModule, OpenId4VcIssuerModule, OpenId4VcIssuanceSessionModule],
  controllers: [ContributorCredentialController],
  providers: [ContributorCredentialService],
  exports: [ContributorCredentialService],
})
export class ContributorCredentialModule {}
