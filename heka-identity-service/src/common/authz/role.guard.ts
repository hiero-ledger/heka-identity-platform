import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { AuthInfo } from 'common/auth'

import { AuthorizationService } from './authorization.service'
import { Capability } from './capability'
import { CAPABILITY_KEY } from './capability.decorator'

@Injectable()
export class RoleGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    if (!this.authorizationService.isEnforced) {
      return true
    }

    const capability = this.reflector.getAllAndOverride<Capability | undefined>(CAPABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // Every guarded endpoint must declare a capability; a missing one is denied rather than allowed
    if (!capability) {
      return false
    }

    const request = context.switchToHttp().getRequest()
    const authInfo = request.user as AuthInfo

    return this.authorizationService.can(authInfo.role, capability)
  }
}
