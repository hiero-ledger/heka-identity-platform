import { RequestMethod, Type } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants'

import { Role } from 'common/auth/auth-info.interface'

import { RoleGuard } from './role.guard'
import { ANY_ROLE_KEY, ROLES_KEY } from './roles.decorator'

/** Who may call a route when the role model is enabled. */
export type RouteAccess =
  /** `@Roles(...)`: only these roles */
  | { kind: 'roles'; roles: Role[] }
  /** `@AnyRole()`: every authenticated role */
  | { kind: 'any' }
  /** Behind `RoleGuard` without a decision: denied when the role model is enabled */
  | { kind: 'undecided' }
  /** Not behind `RoleGuard` (public, or authenticated without role checks) */
  | { kind: 'unguarded'; authenticated: boolean }

export interface RoutePermission {
  controller: string
  handler: string
  method: string
  path: string
  access: RouteAccess
}

const joinPath = (...parts: Array<string | undefined>) =>
  '/' +
  parts
    .flatMap((part) => (part ?? '').split('/'))
    .filter(Boolean)
    .join('/')

const guardNames = (target: object): string[] =>
  ((Reflect.getMetadata(GUARDS_METADATA, target) as Array<{ name?: string }> | undefined) ?? []).map(
    (guard) => guard.name ?? '',
  )

/**
 * Every route of the given controllers with its role decision, read from the same metadata `RoleGuard` evaluates:
 * method-level `@Roles` / `@AnyRole` override controller-level ones, guards may sit on the class or the method.
 */
export function collectRoutePermissions(controllers: Type[]): RoutePermission[] {
  const routes: RoutePermission[] = []
  for (const controller of controllers) {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined
    const version = Reflect.getMetadata(VERSION_METADATA, controller) as string | string[] | undefined
    const versionPrefix = version ? `v${Array.isArray(version) ? version[0] : version}` : undefined
    const prototype = controller.prototype as Record<string, unknown>

    for (const handlerName of Object.getOwnPropertyNames(prototype)) {
      const handler = prototype[handlerName]
      if (handlerName === 'constructor' || typeof handler !== 'function') continue
      const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined
      if (requestMethod === undefined) continue
      const handlerPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined

      const guards = [...guardNames(controller), ...guardNames(handler)]
      const roles = (Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, controller)) as
        Role[] | undefined
      const anyRole = Boolean(
        Reflect.getMetadata(ANY_ROLE_KEY, handler) ?? Reflect.getMetadata(ANY_ROLE_KEY, controller),
      )

      let access: RouteAccess
      if (!guards.includes(RoleGuard.name)) {
        access = { kind: 'unguarded', authenticated: guards.includes('JwtAuthGuard') }
      } else if (roles) {
        access = { kind: 'roles', roles }
      } else if (anyRole) {
        access = { kind: 'any' }
      } else {
        access = { kind: 'undecided' }
      }

      routes.push({
        controller: controller.name,
        handler: handlerName,
        method: RequestMethod[requestMethod],
        path: joinPath(versionPrefix, controllerPath, handlerPath),
        access,
      })
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
}

const MATRIX_ROLES = [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.OrgMember, Role.Issuer, Role.Verifier, Role.User]

/** The role matrix as a Markdown table: one row per route, one column per role (enforced mode). */
export function formatRoleMatrix(routes: RoutePermission[]): string {
  const header = `| Route | ${MATRIX_ROLES.join(' | ')} |`
  const divider = `|---|${MATRIX_ROLES.map(() => ':-:').join('|')}|`
  const rows = routes.map((route) => {
    const cells = MATRIX_ROLES.map((role) => {
      switch (route.access.kind) {
        case 'roles':
          return route.access.roles.includes(role) ? '✓' : ''
        case 'any':
          return '✓'
        case 'undecided':
          return '✗'
        case 'unguarded':
          return route.access.authenticated ? '✓' : 'public'
      }
    })
    return `| \`${route.method} ${route.path}\` | ${cells.join(' | ')} |`
  })
  return [header, divider, ...rows].join('\n')
}
