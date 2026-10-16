import { Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import RoleModelConfig from 'config/role-model'

/**
 * The only place that reads `ROLE_MODEL_ENABLED`. With the role model disabled role restrictions
 * are not enforced; roles and wallets are unaffected.
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
}
