import { createMock } from '@golevelup/ts-vitest'
import { Controller, ExecutionContext, Get } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { AuthInfo, Role } from 'common/auth'

import { AuthorizationService } from '../authorization.service'
import { RoleGuard } from '../role.guard'
import { AnyRole, Roles } from '../roles.decorator'

@Controller('sample')
class SampleController {
  @Roles(Role.Issuer)
  @Get('issuers')
  public issuersOnly() {}

  @AnyRole()
  @Get('any')
  public anyRole() {}

  @Get('forgotten')
  public forgotten() {}
}

@Roles(Role.OrgAdmin)
@Controller('class-level')
class ClassLevelController {
  @Get()
  public inherited() {}

  @Roles(Role.User)
  @Get('override')
  public overridden() {}
}

const contextFor = (controller: object, handler: keyof typeof controller, role: Role) =>
  createMock<ExecutionContext>({
    getClass: () => controller as never,
    getHandler: () => (controller as { prototype: Record<string, unknown> }).prototype[handler] as never,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } as AuthInfo }) }) as never,
  })

const guard = (enforced: boolean) =>
  new RoleGuard(
    new Reflector(),
    createMock<AuthorizationService>({ isEnforced: enforced } as Partial<AuthorizationService>),
  )

describe('RoleGuard', () => {
  describe('role model enabled', () => {
    test('admits only the listed roles', () => {
      expect(guard(true).canActivate(contextFor(SampleController, 'issuersOnly' as never, Role.Issuer))).toBe(true)
      expect(guard(true).canActivate(contextFor(SampleController, 'issuersOnly' as never, Role.User))).toBe(false)
    })

    test('admits every role on @AnyRole', () => {
      for (const role of Object.values(Role)) {
        expect(guard(true).canActivate(contextFor(SampleController, 'anyRole' as never, role))).toBe(true)
      }
    })

    test('denies a route without @Roles or @AnyRole (fail closed)', () => {
      expect(guard(true).canActivate(contextFor(SampleController, 'forgotten' as never, Role.Admin))).toBe(false)
    })

    test('uses controller-level @Roles, and a method-level @Roles overrides it', () => {
      expect(guard(true).canActivate(contextFor(ClassLevelController, 'inherited' as never, Role.OrgAdmin))).toBe(true)
      expect(guard(true).canActivate(contextFor(ClassLevelController, 'inherited' as never, Role.User))).toBe(false)
      expect(guard(true).canActivate(contextFor(ClassLevelController, 'overridden' as never, Role.User))).toBe(true)
      expect(guard(true).canActivate(contextFor(ClassLevelController, 'overridden' as never, Role.OrgAdmin))).toBe(
        false,
      )
    })
  })

  describe('role model disabled', () => {
    test('admits every role everywhere, including routes without a decision', () => {
      for (const handler of ['issuersOnly', 'anyRole', 'forgotten']) {
        expect(guard(false).canActivate(contextFor(SampleController, handler as never, Role.User))).toBe(true)
      }
    })
  })
})
