import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'

import { AgentModule } from 'common/agent'
import JwtConfig from 'config/jwt'

import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'
import { TokenRevocationService } from './token-revocation.service'

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (jwtConfig: ConfigType<typeof JwtConfig>) => jwtConfig,
      inject: [JwtConfig.KEY],
    }),
    AgentModule,
    HttpModule,
  ],
  providers: [AuthService, JwtStrategy, TokenRevocationService],
  exports: [AuthService],
})
export class AuthModule {}
