import { SetMetadata } from '@nestjs/common'

import { Role } from 'common/auth'

export const ROLES_KEY = 'roles'
export const ANY_ROLE_KEY = 'anyRole'

/** With the role model enabled, only these roles may call the route (method or controller level). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)

/**
 * The explicit decision that every authenticated role may call the route, e.g. reads confined to the caller's own
 * wallet. With the role model enabled, `RoleGuard` denies a route that has neither `@Roles` nor `@AnyRole`, so a
 * forgotten decorator closes a route instead of opening it.
 */
export const AnyRole = () => SetMetadata(ANY_ROLE_KEY, true)
