import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { Server } from 'net'
import request from 'supertest'

import { AppConfig } from '../src/core/config/configs/app.config'
import { UserRole } from '../src/core/database'
import { initializeMikroOrm, startTestApp } from './helpers'

const ADMIN = { name: 'root-admin', password: 'Password1234!' }

describe('E2E role assignment', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema

    await ormSchemaGenerator.refresh()

    // The first Admin is created from the configuration at startup
    process.env.ADMIN_NAME = ADMIN.name
    process.env.ADMIN_PASSWORD = ADMIN.password
    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    delete process.env.ADMIN_NAME
    delete process.env.ADMIN_PASSWORD
    if (nestApp) await nestApp.close()
    if (ormSchemaGenerator) await ormSchemaGenerator.clear()
    if (orm) await orm.close(true)
  })

  let userSeq = 0
  const register = async () => {
    const user = { name: `user${Date.now()}-${userSeq++}`, password: 'Password1234!' }
    expect((await request(app).post('/api/v1/user/register').send(user)).status).toBe(201)
    return user
  }

  const login = async (user: { name: string; password: string }) => {
    const response = await request(app).post('/api/v1/oauth/token').send(user)
    expect(response.status).toBe(200)
    const token = response.body.access as string
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as {
      roles: string[]
      org_id?: string
    }
    return { token, role: payload.roles[0], orgId: payload.org_id }
  }

  const listUsers = (token: string) => request(app).get('/api/v1/users').auth(token, { type: 'bearer' })

  const findUserId = async (token: string, name: string) => {
    const response = await listUsers(token)
    expect(response.status).toBe(200)
    return (response.body.items as Array<{ id: string; name: string }>).find((user) => user.name === name)?.id
  }

  const setRole = (token: string, id: string, role: string) =>
    request(app).patch(`/api/v1/users/${id}/role`).auth(token, { type: 'bearer' }).send({ role })

  test('an Admin assigns roles, and an OrgAdmin assigns organization roles only', async () => {
    const admin = await login(ADMIN)
    expect(admin.role).toBe(UserRole.Admin)

    // Admin promotes a new user to OrgAdmin; the next token carries the role and the organization
    const orgAdminUser = await register()
    const orgAdminId = (await findUserId(admin.token, orgAdminUser.name))!
    const promoted = await setRole(admin.token, orgAdminId, UserRole.OrgAdmin)
    expect(promoted.status).toBe(200)
    expect(promoted.body).toEqual({ id: orgAdminId, name: orgAdminUser.name, role: UserRole.OrgAdmin })
    const orgAdmin = await login(orgAdminUser)
    expect(orgAdmin.role).toBe(UserRole.OrgAdmin)
    expect(orgAdmin.orgId).toBe(new AppConfig().orgId)

    // OrgAdmin sees users it can manage, but not the Admin
    const issuerUser = await register()
    const visibleNames = ((await listUsers(orgAdmin.token)).body.items as Array<{ name: string }>).map((u) => u.name)
    expect(visibleNames).toContain(issuerUser.name)
    expect(visibleNames).not.toContain(ADMIN.name)

    const issuerId = (await findUserId(orgAdmin.token, issuerUser.name))!
    expect((await setRole(orgAdmin.token, issuerId, UserRole.Issuer)).status).toBe(200)
    expect((await login(issuerUser)).role).toBe(UserRole.Issuer)

    // OrgAdmin cannot assign roles outside the organization, nor change an Admin or itself
    expect((await setRole(orgAdmin.token, issuerId, UserRole.Admin)).status).toBe(403)
    expect((await setRole(orgAdmin.token, issuerId, UserRole.User)).status).toBe(403)
    const adminId = (await findUserId(admin.token, ADMIN.name))!
    expect((await setRole(orgAdmin.token, adminId, UserRole.OrgMember)).status).toBe(404)
    expect((await setRole(orgAdmin.token, orgAdminId, UserRole.OrgMember)).status).toBe(403)
  })

  test('other roles cannot list users or assign roles', async () => {
    const admin = await login(ADMIN)
    const user = await register()
    const userId = (await findUserId(admin.token, user.name))!
    const { token } = await login(user)

    expect((await listUsers(token)).status).toBe(403)
    expect((await setRole(token, userId, UserRole.Admin)).status).toBe(403)
    expect((await request(app).get('/api/v1/users')).status).toBe(401)
  })

  test('two Admins demoting each other at the same time leave one of them Admin', async () => {
    const root = await login(ADMIN)

    // Several pairs at once make the requests of a pair overlap
    const pairs = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const users = [await register(), await register()]
        const ids = await Promise.all(users.map(async (user) => (await findUserId(root.token, user.name))!))
        for (const id of ids) {
          expect((await setRole(root.token, id, UserRole.Admin)).status).toBe(200)
        }
        const tokens = await Promise.all(users.map(async (user) => (await login(user)).token))
        return { ids, tokens }
      }),
    )

    const responses = await Promise.all(
      pairs.map(({ ids, tokens }) =>
        Promise.all([setRole(tokens[0], ids[1], UserRole.User), setRole(tokens[1], ids[0], UserRole.User)]),
      ),
    )

    const users = (await listUsers(root.token)).body.items as Array<{ id: string; role: string }>
    pairs.forEach(({ ids }, index) => {
      expect(responses[index].map((response) => response.status).sort()).toEqual([200, 403])
      const roles = users.filter((user) => ids.includes(user.id)).map((user) => user.role)
      expect(roles.sort()).toEqual([UserRole.Admin, UserRole.User])
    })
  })

  test('an Admin cannot change its own role, and invalid input is rejected', async () => {
    const admin = await login(ADMIN)
    const adminId = (await findUserId(admin.token, ADMIN.name))!

    expect((await setRole(admin.token, adminId, UserRole.User)).status).toBe(403)
    expect((await setRole(admin.token, adminId, 'Superuser')).status).toBe(400)
    expect((await setRole(admin.token, 'not-a-uuid', UserRole.User)).status).toBe(400)
  })
})
