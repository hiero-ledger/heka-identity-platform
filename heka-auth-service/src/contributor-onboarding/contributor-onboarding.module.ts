import { MikroOrmModule } from '@mikro-orm/nestjs'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'

import { ConfigModule, ConfigService } from '@config'

import { ContributorAuditEvent } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'
import { ContributorOnboardingController } from './contributor-onboarding.controller'
import { ContributorOnboardingService } from './contributor-onboarding.service'

@Module({
  imports: [
    MikroOrmModule.forFeature([ContributorBinding, ContributorAuditEvent]),
    HttpModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.jwtConfig.secret,
        signOptions: {
          issuer: configService.jwtConfig.issuer,
          audience: configService.jwtConfig.audience,
          expiresIn: configService.jwtConfig.accessExpiry,
        },
      }),
    }),
  ],
  controllers: [ContributorOnboardingController],
  providers: [ContributorOnboardingService],
  exports: [ContributorOnboardingService],
})
export class ContributorOnboardingModule {}
