import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { initializeMikroOrm, startTestApp } from './helpers'
import { LoginRequest, LogoutRequest, RefreshRequest } from '../src/oauth/dto'
import { RegisterUserRequest } from '../src/user/dto'
import { UserRole } from '../src/core/database'
import { AuthorizationTokenType } from '../src/common/const'

describe('E2E authorization', () => {
  let ormSchemaGenerator: SchemaGenerator

  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    const orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.getSchemaGenerator()

    await ormSchemaGenerator.refreshDatabase()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    await nestApp.close()
    await ormSchemaGenerator.clearDatabase()
  })

  const newUser = () => ({
    name: 'user' + Date.now().toString(),
    password: 'Password1234!',
  })

  test('auth flow', async () => {
    const user = newUser()
    const createUserResponse = await request(app)
      .post('/api/v1/user/register')
      .send({
        name: user.name,
        password: user.password,
        role: UserRole.Issuer,
      } satisfies RegisterUserRequest)

    expect(createUserResponse.status).toBe(201)

    const loginUserResponse = await request(app)
      .post('/api/v1/oauth/token')
      .send({
        name: user.name,
        password: user.password,
      } satisfies LoginRequest)

    expect(loginUserResponse.status).toBe(200)
    expect(loginUserResponse.body.access).toBeDefined()
    expect(loginUserResponse.body.refresh).toBeDefined()
    expect(loginUserResponse.body.token_type).toBe(AuthorizationTokenType)

    await new Promise((res) => setTimeout(res, 1000))

    const refreshTokenResponse = await request(app)
      .post('/api/v1/oauth/refresh')
      .auth(loginUserResponse.body.access, { type: 'bearer' })
      .send({
        refresh: loginUserResponse.body.refresh,
      } satisfies RefreshRequest)

    expect(refreshTokenResponse.status).toBe(200)

    expect(refreshTokenResponse.body.access).toBeDefined()
    expect(refreshTokenResponse.body.refresh).toBeDefined()
    expect(refreshTokenResponse.body.token_type).toBe(AuthorizationTokenType)

    expect(refreshTokenResponse.body.access).not.toBe(loginUserResponse.body.access)
    expect(refreshTokenResponse.body.refresh).not.toBe(loginUserResponse.body.refresh)

    const revokeTokenResponse = await request(app)
      .post('/api/v1/oauth/revoke')
      .auth(refreshTokenResponse.body.access, { type: 'bearer' })
      .send({
        refresh: loginUserResponse.body.refresh,
      } satisfies LogoutRequest)

    expect(revokeTokenResponse.status).toBe(205)
  })
})
