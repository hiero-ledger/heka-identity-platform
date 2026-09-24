import { readdirSync } from 'fs'
import { join, resolve } from 'path'

import { createMock } from '@golevelup/ts-vitest'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'

import { JwtAuthGuard, Role } from 'common/auth'

import { AuthorizationService } from '../authorization.service'
import { Capability, CAPABILITY_ROLES } from '../capability'
import { CAPABILITY_KEY } from '../capability.decorator'
import { RoleGuard } from '../role.guard'

describe('AuthorizationService', () => {
  const enforced = new AuthorizationService({ enabled: true })
  const relaxed = new AuthorizationService({ enabled: false })

  test.each([
    [Capability.Issue, [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer]],
    [Capability.Verify, [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Verifier]],
    [Capability.Did, [Role.Admin, Role.OrgAdmin, Role.Issuer, Role.Verifier]],
    [Capability.Prepare, [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer, Role.Verifier]],
    [Capability.Connect, [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer, Role.Verifier]],
    [Capability.Hold, Object.values(Role)],
    [Capability.Read, Object.values(Role)],
    [Capability.Profile, Object.values(Role)],
  ])('enforced: %s is granted exactly to %o', (capability: Capability, roles: Role[]) => {
    for (const role of Object.values(Role)) {
      expect(enforced.can(role, capability)).toBe(roles.includes(role))
    }
  })

  test('disabled: every role holds every capability', () => {
    for (const role of Object.values(Role)) {
      for (const capability of Object.values(Capability)) {
        expect(relaxed.can(role, capability)).toBe(true)
      }
    }
  })

  test('assert throws ForbiddenException for a missing capability', () => {
    expect(() => enforced.assert({ role: Role.Verifier }, Capability.Issue)).toThrow(ForbiddenException)
    expect(() => enforced.assert({ role: Role.Issuer }, Capability.Issue)).not.toThrow()
    expect(() => relaxed.assert({ role: Role.Verifier }, Capability.Issue)).not.toThrow()
  })
})

describe('RoleGuard', () => {
  const makeContext = (role: Role): ExecutionContext =>
    createMock<ExecutionContext>({
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    })

  const makeGuard = (enabled: boolean, capability?: Capability): RoleGuard => {
    const reflector = createMock<Reflector>({ getAllAndOverride: vi.fn().mockReturnValue(capability) })
    return new RoleGuard(reflector, new AuthorizationService({ enabled }))
  }

  test('allows a role that holds the capability', () => {
    expect(makeGuard(true, Capability.Issue).canActivate(makeContext(Role.Issuer))).toBe(true)
  })

  test('rejects a role that lacks the capability', () => {
    expect(makeGuard(true, Capability.Issue).canActivate(makeContext(Role.OrgMember))).toBe(false)
  })

  test('rejects an endpoint that declares no capability while enforcement is on', () => {
    expect(makeGuard(true).canActivate(makeContext(Role.Admin))).toBe(false)
  })

  test('allows everything while enforcement is off', () => {
    expect(makeGuard(false, Capability.Issue).canActivate(makeContext(Role.OrgMember))).toBe(true)
    expect(makeGuard(false).canActivate(makeContext(Role.User))).toBe(true)
  })
})

describe('Endpoint capability coverage', () => {
  const findControllerFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : findControllerFiles(path)
      return entry.name.endsWith('.controller.ts') ? [path] : []
    })

  let controllers: Array<new (...args: never[]) => unknown> = []

  beforeAll(async () => {
    const modules = (await Promise.all(
      findControllerFiles(resolve(process.cwd(), 'src')).map((file) => import(file)),
    )) as Array<Record<string, unknown>>
    controllers = modules
      .flatMap((module) => Object.values(module))
      .filter((value): value is new (...args: never[]) => unknown => typeof value === 'function')
      .filter((controller) => Reflect.getMetadata('path', controller) !== undefined)
  })

  const guardsOf = (controller: object) =>
    (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined) ?? []

  test('controllers are discovered', () => {
    expect(controllers.length).toBeGreaterThan(20)
  })

  test('every authenticated endpoint is guarded by RoleGuard and declares exactly one capability', () => {
    const missing: string[] = []

    for (const controller of controllers.filter((c) => guardsOf(c).includes(JwtAuthGuard))) {
      if (!guardsOf(controller).includes(RoleGuard)) {
        missing.push(`${controller.name}: RoleGuard`)
      }

      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[name]
        if (typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) {
          continue
        }
        const capability = Reflect.getMetadata(CAPABILITY_KEY, handler) as Capability | undefined
        if (!capability || !(capability in CAPABILITY_ROLES)) {
          missing.push(`${controller.name}.${name}`)
        }
      }
    }

    expect(missing).toEqual([])
  })
})
