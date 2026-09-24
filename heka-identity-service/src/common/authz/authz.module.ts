import { Global, Module } from '@nestjs/common'

import { AuthorizationService } from './authorization.service'
import { RoleGuard } from './role.guard'

@Global()
@Module({
  providers: [AuthorizationService, RoleGuard],
  exports: [AuthorizationService, RoleGuard],
})
export class AuthzModule {}
