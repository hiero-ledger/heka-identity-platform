import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { AuthInfo, Role } from 'common/auth'

import { AuthorizationService } from './authorization.service'
import { ROLES_KEY } from './roles.decorator'

@Injectable()
export class RoleGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    // With the role model disabled every authenticated user may call every endpoint
    if (!this.authorizationService.isEnforced) {
      return true
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const user = request.user as AuthInfo

    return requiredRoles.includes(user.role)
  }
}
