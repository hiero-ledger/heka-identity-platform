import { Global, Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { AuthService } from './auth.service'
import { JwtAuthGuard } from './jwt-auth.guard'
import { TokenVerifier } from './token-verifier.service'

// Global so that `@UseGuards(JwtAuthGuard)` resolves `AuthService` in every feature module
// without each of them importing this module.
@Global()
@Module({
  imports: [AgentModule],
  providers: [TokenVerifier, AuthService, JwtAuthGuard],
  exports: [TokenVerifier, AuthService, JwtAuthGuard],
})
export class AuthModule {}
