import { Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { OpenId4VcVerifierCreateDto } from 'openid4vc/verifier/dto'
import { Role } from 'src/common/auth'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'

describe('OpenId4VcVerifierController', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
  })

  beforeEach(async () => {
    await ormSchemaGenerator.refresh()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterEach(async () => {
    // TODO: Find a way to explicitly await the required condition
    // Give AFJ event listeners some time to process pending events
    await sleep(5000)

    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clear()
    await orm.close(true)
  })

  test('create verifier', async () => {
    const firstAdminId = uuid()
    const firstAdminAuthToken = await createAuthToken(firstAdminId, Role.Admin)
    const response = await request(app)
      .post(`/openid4vc/verifier/`)
      .auth(firstAdminAuthToken, { type: 'bearer' })
      .send({
        publicVerifierId: 'publicVerifierId',
      } satisfies OpenId4VcVerifierCreateDto)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      createdAt: expect.any(String),
      id: expect.any(String),
      publicVerifierId: 'publicVerifierId',
      type: 'OpenId4VcVerifierRecord',
      updatedAt: expect.any(String),
    })
  })
})
