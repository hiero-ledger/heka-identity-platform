import { MikroOrmModule } from '@mikro-orm/nestjs'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'

import { ConfigModule, ConfigService } from '@config'
import { ContributorOnboardingModule } from '../contributor-onboarding'

import { GpgChallengeController } from './gpg-challenge.controller'
import { GpgChallenge } from './gpg-challenge.entity'
import { GpgChallengeService } from './gpg-challenge.service'

/**
 * Self-contained NestJS module that encapsulates the full GPG challenge-response
 * flow: nonce generation, single-use lifecycle management, real openpgp
 * signature verification against public keys fetched from GitHub, and a
 * lightweight status endpoint consumed by the Heka GitHub App.
 *
 * Depends on ContributorOnboardingModule so that successful (or failed)
 * verifications can be forwarded to ContributorOnboardingService to record
 * audit events and update the contributor binding.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([GpgChallenge]),
    HttpModule,
    ConfigModule,
    ContributorOnboardingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.jwtConfig.secret,
      }),
    }),
  ],
  controllers: [GpgChallengeController],
  providers: [GpgChallengeService],
  exports: [GpgChallengeService],
})
export class GpgChallengeModule {}
