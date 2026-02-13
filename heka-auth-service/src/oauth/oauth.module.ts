import { ConfigModule, ConfigService } from '@config'
import { Token, User } from '@core/database'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'

import { BearerGuard } from './guards'
import { OAuthController } from './oath.controller'
import { OAuthService } from './oauth.service'
import { JwtStrategy } from './stratigies'

@Module({
  imports: [
    MikroOrmModule.forFeature({ entities: [User, Token] }),
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.jwtConfig.secret,
        signOptions: {
          expiresIn: configService.jwtConfig.accessExpiry,
        },
      }),
    }),
  ],
  controllers: [OAuthController],
  providers: [OAuthService, JwtStrategy, BearerGuard],
  exports: [OAuthService, JwtStrategy],
})
export class OAuthModule {}
