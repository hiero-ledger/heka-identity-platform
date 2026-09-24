import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { AuthInfo, Role } from 'common/auth'
import RoleModelConfig from 'config/role-model'

import { Capability, CAPABILITY_ROLES } from './capability'

/**
 * The only place that reads `ROLE_MODEL_ENABLED`. With the role model disabled every actor holds
 * every capability; roles, organizations and wallets are unaffected.
 */
@Injectable()
export class AuthorizationService {
  public constructor(
    @Inject(RoleModelConfig.KEY)
    private readonly roleModelConfig: ConfigType<typeof RoleModelConfig>,
  ) {}

  public get isEnforced(): boolean {
    return this.roleModelConfig.enabled
  }

  public can(role: Role, capability: Capability): boolean {
    return !this.isEnforced || CAPABILITY_ROLES[capability].includes(role)
  }

  public assert(authInfo: Pick<AuthInfo, 'role'>, capability: Capability): void {
    if (!this.can(authInfo.role, capability)) {
      throw new ForbiddenException(`Role '${authInfo.role}' does not have the '${capability}' capability`)
    }
  }
}
