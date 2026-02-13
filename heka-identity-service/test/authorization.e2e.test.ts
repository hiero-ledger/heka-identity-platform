import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { CreateInvitationRequestDto } from 'src/connection/dto'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, signJwt, startTestApp } from './helpers'

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
    // TODO: Find a way to explicitly await the required condition
    // Give AFJ event listeners some time to process pending events
    await sleep(2000)

    await nestApp.close()

    await ormSchemaGenerator.clearDatabase()
  })

  test('authorizes user with required role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Doctor',
        type: 'access',
        roles: ['Issuer'],
        org_id: uuid(),
      },
      'test',
      {
        subject: uuid(),
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    const createConnectionInvitationResponse = await request(app)
      .post('/connections/create-invitation')
      .auth(userAuthToken, { type: 'bearer' })
      .send({
        label: 'Doctor',
        alias: 'Connection with Patient',
      } satisfies CreateInvitationRequestDto)

    expect(createConnectionInvitationResponse.status).toBe(200)
  })

  test('forbids user without required role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      'test',
      {
        subject: uuid(),
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    const createConnectionInvitationResponse = await request(app)
      .post('/connections/create-invitation')
      .auth(userAuthToken, { type: 'bearer' })
      .send({
        label: 'John',
        alias: 'Connection with Jane',
      } satisfies CreateInvitationRequestDto)

    expect(createConnectionInvitationResponse.status).toBe(403)
  })

  test('authorizes user if required roles are not set for method', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      'test',
      {
        subject: uuid(),
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    const getDidsResponse = await request(app).get('/dids').query({ own: true }).auth(userAuthToken, { type: 'bearer' })

    expect(getDidsResponse.status).toBe(200)
  })

  test('authorizes user if RoleGuard is not used for controller', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      'test',
      {
        subject: uuid(),
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(200)
  })
})
