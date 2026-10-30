import { MikroOrmModule } from '@mikro-orm/nestjs'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'

import { ContributorOnboardingModule } from '../contributor-onboarding'

import { GpgChallengeController } from './gpg-challenge.controller'
import { GpgChallenge } from './gpg-challenge.entity'
import { GpgChallengeService } from './gpg-challenge.service'
import { GithubAppStatusGuard } from './github-app-status.guard'

@Module({
  imports: [MikroOrmModule.forFeature([GpgChallenge]), HttpModule, ContributorOnboardingModule],
  controllers: [GpgChallengeController],
  providers: [GpgChallengeService, GithubAppStatusGuard],
  exports: [GpgChallengeService],
})
export class GpgChallengeModule {}
