import { MikroOrmModule } from '@mikro-orm/nestjs'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'

import { ContributorOnboardingModule } from '../contributor-onboarding'

import { GpgChallengeController } from './gpg-challenge.controller'
import { GpgChallenge } from './gpg-challenge.entity'
import { GpgChallengeService } from './gpg-challenge.service'

@Module({
  imports: [MikroOrmModule.forFeature([GpgChallenge]), HttpModule, ContributorOnboardingModule],
  controllers: [GpgChallengeController],
  providers: [GpgChallengeService],
  exports: [GpgChallengeService],
})
export class GpgChallengeModule {}
