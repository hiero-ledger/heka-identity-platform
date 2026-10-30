import { MikroOrmModule } from '@mikro-orm/nestjs'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'

import { ContributorAuditEvent } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'
import { ContributorOnboardingController } from './contributor-onboarding.controller'
import { ContributorOnboardingService } from './contributor-onboarding.service'
import { OAuthLinkAttempt } from './oauth-link-attempt.entity'

@Module({
  imports: [MikroOrmModule.forFeature([ContributorBinding, ContributorAuditEvent, OAuthLinkAttempt]), HttpModule],
  controllers: [ContributorOnboardingController],
  providers: [ContributorOnboardingService],
  exports: [ContributorOnboardingService],
})
export class ContributorOnboardingModule {}
