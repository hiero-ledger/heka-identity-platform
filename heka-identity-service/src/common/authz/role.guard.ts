import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { AuthInfo, Role } from 'common/auth'

import { AuthorizationService } from './authorization.service'
import { ANY_ROLE_KEY, ROLES_KEY } from './roles.decorator'

@Injectable()
export class RoleGuard implements CanActivate {
  private readonly logger = new Logger(RoleGuard.name)

  public constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    // With the role model disabled every authenticated user may call every endpoint
    if (!this.authorizationService.isEnforced) {
      return true
    }

    const targets = [context.getHandler(), context.getClass()]
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets)
    if (requiredRoles) {
      const request = context.switchToHttp().getRequest()
      const user = request.user as AuthInfo
      return requiredRoles.includes(user.role)
    }

    if (this.reflector.getAllAndOverride<boolean | undefined>(ANY_ROLE_KEY, targets)) {
      return true
    }

    // Neither @Roles nor @AnyRole: fail closed, so a route whose decision was forgotten is not open to every role
    this.logger.error(
      `${context.getClass().name}.${context.getHandler().name} has no @Roles or @AnyRole decision; denied`,
    )
    return false
  }
}
