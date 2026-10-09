import { readdirSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

import { Type } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'

import { Role } from 'common/auth/auth-info.interface'

import { collectRoutePermissions, formatRoleMatrix, RoutePermission } from '../route-permissions'

const SRC = join(__dirname, '..', '..', '..')

/** Routes reachable without a token, on purpose. */
const PUBLIC_ROUTES = ['GET /credentials/status/:id', 'GET /demo/token', 'GET /health', 'GET /revocation/tails/:hash']

const ISSUING = [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer]
const VERIFYING = [Role.Admin, Role.OrgAdmin, Role.OrgManager, Role.Issuer, Role.Verifier]

async function loadControllers(): Promise<Type[]> {
  const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('.controller.ts'),
  )
  const controllers: Type[] = []
  for (const file of files) {
    const module = (await import(pathToFileURL(join(SRC, file)).href)) as Record<string, unknown>
    for (const exported of Object.values(module)) {
      if (typeof exported === 'function' && Reflect.hasMetadata(PATH_METADATA, exported)) {
        controllers.push(exported as Type)
      }
    }
  }
  return controllers
}

const key = (route: RoutePermission) => `${route.method} ${route.path}`

describe('route coverage of the role model', () => {
  let routes: RoutePermission[]

  beforeAll(async () => {
    routes = collectRoutePermissions(await loadControllers())
  }, 120_000)

  test('finds the controllers', () => {
    expect(routes.length).toBeGreaterThan(50)
  })

  test('every route behind RoleGuard has an explicit @Roles or @AnyRole decision', () => {
    const undecided = routes.filter((route) => route.access.kind === 'undecided').map(key)
    expect(undecided, `add @Roles(...) or @AnyRole() to: ${undecided.join(', ')}`).toEqual([])
  })

  test('only the public allowlist is reachable without a token, and every other route checks roles', () => {
    const unguarded = routes.filter((route) => route.access.kind === 'unguarded')
    expect(
      unguarded.filter((route) => route.access.kind === 'unguarded' && !route.access.authenticated).map(key),
    ).toEqual(PUBLIC_ROUTES)
    expect(
      unguarded.filter((route) => route.access.kind === 'unguarded' && route.access.authenticated).map(key),
    ).toEqual([])
  })

  test('every read is open to every authenticated role (data is confined to the caller’s own wallet)', () => {
    const restrictedReads = routes
      .filter(
        (route) =>
          route.method === 'GET' && route.access.kind === 'roles' && route.controller !== 'OrganizationAdminController',
      )
      .map(key)
    expect(restrictedReads).toEqual([])
  })

  test.each([
    ['POST /v2/credentials/offer-by-template', ISSUING],
    ['POST /v2/credentials/proof-by-template', VERIFYING],
    ['POST /v2/schemas', ISSUING],
    ['PATCH /v2/schemas/:id', ISSUING],
    ['POST /v2/schemas/:id/registration', ISSUING],
    ['POST /issuance-templates', ISSUING],
    ['PATCH /issuance-templates/:id', ISSUING],
    ['DELETE /issuance-templates/:id', ISSUING],
    ['POST /verification-templates', VERIFYING],
    ['PATCH /verification-templates/:id', VERIFYING],
    ['DELETE /verification-templates/:id', VERIFYING],
    ['POST /dids', [Role.Admin, Role.OrgAdmin, Role.Issuer, Role.Verifier]],
  ])('%s is limited to the roles of its purpose', (route, roles) => {
    const found = routes.find((candidate) => key(candidate) === route)
    expect(found?.access).toEqual({ kind: 'roles', roles })
  })

  test('the role matrix only changes on purpose (review the snapshot diff)', () => {
    expect(formatRoleMatrix(routes)).toMatchSnapshot()
  })

  test('loads every controller, the organization administration API included', () => {
    const controllers = new Set(routes.map((route) => route.controller))
    expect(controllers.size).toBeGreaterThan(15)
    expect(controllers).toContain('OrganizationAdminController')
  })
})
