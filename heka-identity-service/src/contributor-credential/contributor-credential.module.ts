import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { OpenId4VcIssuanceSessionModule } from 'openid4vc/issuance-sessions/issuance-session.module'
import { OpenId4VcIssuerModule } from 'openid4vc/issuer/issuer.module'

import { AuthServiceClient } from './auth-service.client'
import { ContributorCredentialController } from './contributor-credential.controller'
import { ContributorCredentialService } from './contributor-credential.service'
import { ContributorJwtGuard } from './contributor-jwt.guard'

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
 *   - `AuthServiceClient`       — queries heka-auth-service for verified contributor data
 *   - `ContributorJwtGuard`     — validates the contributor token from auth-service
 */
@Module({
  imports: [
    AgentModule,
    OpenId4VcIssuerModule,
    OpenId4VcIssuanceSessionModule,
  ],
  controllers: [ContributorCredentialController],
  providers: [ContributorCredentialService, AuthServiceClient, ContributorJwtGuard],
  exports: [ContributorCredentialService],
})
export class ContributorCredentialModule {}
