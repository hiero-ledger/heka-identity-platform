import { SetMetadata } from '@nestjs/common'

import { Role } from 'common/auth'

export const ROLES_KEY = 'roles'
export const ANY_ROLE_KEY = 'anyRole'

/** With the role model enabled, only these roles may call the route (method or controller level). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)
export const AnyRole = () => SetMetadata(ANY_ROLE_KEY, true)
