import { Module } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'

import { AgentModule } from 'common/agent'
import JwtConfig from 'config/jwt'

import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (jwtConfig: ConfigType<typeof JwtConfig>) => jwtConfig,
      inject: [JwtConfig.KEY],
    }),
    AgentModule,
  ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
