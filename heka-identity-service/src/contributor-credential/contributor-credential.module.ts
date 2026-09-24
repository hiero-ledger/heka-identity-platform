import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { ContributorBinding } from 'contributor-onboarding'
import { OpenId4VcIssuanceSessionModule } from 'openid4vc/issuance-sessions/issuance-session.module'
import { OpenId4VcIssuerModule } from 'openid4vc/issuer/issuer.module'

import { ContributorCredentialController } from './contributor-credential.controller'
import { ContributorCredentialService } from './contributor-credential.service'

/**
 * ContributorCredentialModule
 *
 * Encapsulates the OID4VCI issuance flow for the `GithubContributorCredential`
 * SD-JWT VC.
 *
 * Responsibilities:
 *   - Bootstrap the static global issuer on application startup (idempotent).
 *   - Expose `POST /v2/contributor-credential/offer` to create credential offers
 *     for verified contributors.
 *
 * Dependencies:
 *   - `AgentModule`             — provides the root Credo agent for tenant access
 *   - `OpenId4VcIssuerModule`   — `OpenId4VcIssuerService` (creates/updates issuer records)
 *   - `OpenId4VcIssuanceSessionModule` — `OpenId4VcIssuanceSessionService` (creates offers)
 *   - `MikroOrmModule.forFeature([ContributorBinding])` — typed repository access
 */
@Module({
  imports: [
    AgentModule,
    OpenId4VcIssuerModule,
    OpenId4VcIssuanceSessionModule,
    MikroOrmModule.forFeature([ContributorBinding]),
  ],
  controllers: [ContributorCredentialController],
  providers: [ContributorCredentialService],
  exports: [ContributorCredentialService],
})
export class ContributorCredentialModule {}
