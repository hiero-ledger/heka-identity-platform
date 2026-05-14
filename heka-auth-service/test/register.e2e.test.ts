import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { LoginRequest } from '../src/oauth/dto'
import { User, UserRole } from '../src/core/database'
import { RegisterUserRequest } from '../src/user/dto'
import { UpdateUserRoleRequest } from '../src/user/dto'
import { initializeMikroOrm, startTestApp } from './helpers'

describe('E2E register privilege-escalation prevention', () => {
  let ormSchemaGenerator: SchemaGenerator
  let nestApp: INestApplication
  let app: Server
  let orm: Awaited<ReturnType<typeof initializeMikroOrm>>

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'testsecrettestsecrettestsecretXX'

    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.getSchemaGenerator()
    await ormSchemaGenerator.refreshDatabase()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  beforeEach(async () => {
    await ormSchemaGenerator.clearDatabase()
  })

  afterAll(async () => {
    await nestApp.close()
    await ormSchemaGenerator.clearDatabase()
  })

  const uniqueName = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const password = 'Password1234!'

  const registerUser = (name: string) =>
    request(app).post('/api/v1/user/register').send({ name, password } satisfies RegisterUserRequest)

  const loginUser = (name: string) =>
    request(app)
      .post('/api/v1/oauth/token')
      .send({ name, password } satisfies LoginRequest)

  it('registers without role field — new user is always assigned UserRole.User', async () => {
    const name = uniqueName('plain')

    const registerRes = await registerUser(name)
    expect(registerRes.status).toBe(201)

    const loginRes = await loginUser(name)
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.access).toBeDefined()

    // Verify via the token repository — user exists and role is User
    const em = orm.em.fork()
    const user = await em.findOneOrFail(User, { name })
    expect(user.role).toBe(UserRole.User)
  })

  it('registers with role: Admin in the body — rejected with 400 (whitelisted DTO rejects unknown property)', async () => {
    const res = await request(app)
      .post('/api/v1/user/register')
      .send({ name: uniqueName('hacker'), password, role: 'Admin' })

    // Global ValidationPipe uses forbidNonWhitelisted: true, so extra properties are rejected
    expect(res.status).toBe(400)
  })

  it('PATCH /:id/role without an auth token — 401 Unauthorized', async () => {
    const res = await request(app)
      .patch('/api/v1/user/00000000-0000-0000-0000-000000000000/role')
      .send({ role: UserRole.Admin } satisfies UpdateUserRoleRequest)

    expect(res.status).toBe(401)
  })

  it('PATCH /:id/role as a non-Admin (User role) — 403 Forbidden', async () => {
    const name = uniqueName('regular')

    await registerUser(name)
    const loginRes = await loginUser(name)
    const token: string = loginRes.body.access

    const res = await request(app)
      .patch('/api/v1/user/00000000-0000-0000-0000-000000000000/role')
      .auth(token, { type: 'bearer' })
      .send({ role: UserRole.Admin } satisfies UpdateUserRoleRequest)

    expect(res.status).toBe(403)
  })

  it('Admin successfully changes another user role — 200 with updated role', async () => {
    const adminName = uniqueName('admin')
    const targetName = uniqueName('target')

    // Register both users — both start as UserRole.User
    await registerUser(adminName)
    await registerUser(targetName)

    // Directly elevate adminUser to Admin via ORM (no API shortcut exists by design)
    const em = orm.em.fork()
    const adminUser = await em.findOneOrFail(User, { name: adminName })
    adminUser.role = UserRole.Admin
    await em.persistAndFlush(adminUser)

    // Retrieve target user ID
    const targetUser = await em.findOneOrFail(User, { name: targetName })

    // Login as Admin to receive a valid access token
    const adminLoginRes = await loginUser(adminName)
    expect(adminLoginRes.status).toBe(200)
    const adminToken: string = adminLoginRes.body.access

    // PATCH the target user's role
    const patchRes = await request(app)
      .patch(`/api/v1/user/${targetUser.id}/role`)
      .auth(adminToken, { type: 'bearer' })
      .send({ role: UserRole.Issuer } satisfies UpdateUserRoleRequest)

    expect(patchRes.status).toBe(200)
    expect(patchRes.body.id).toBe(targetUser.id)
    expect(patchRes.body.role).toBe(UserRole.Issuer)

    // Confirm persistence
    await em.refresh(targetUser)
    expect(targetUser.role).toBe(UserRole.Issuer)
  })

  it('only admin tries to remove their own admin role — 400 BadRequest', async () => {
    const adminName = uniqueName('sole_admin')

    await registerUser(adminName)

    // Elevate to Admin via ORM — this is the only admin in the system for this test
    const em = orm.em.fork()
    const adminUser = await em.findOneOrFail(User, { name: adminName })
    adminUser.role = UserRole.Admin
    await em.persistAndFlush(adminUser)

    // Login as the sole admin
    const adminLoginRes = await loginUser(adminName)
    expect(adminLoginRes.status).toBe(200)
    const adminToken: string = adminLoginRes.body.access

    // Attempt to demote themselves — should be blocked
    const patchRes = await request(app)
      .patch(`/api/v1/user/${adminUser.id}/role`)
      .auth(adminToken, { type: 'bearer' })
      .send({ role: UserRole.User } satisfies UpdateUserRoleRequest)

    expect(patchRes.status).toBe(400)
  })
})
