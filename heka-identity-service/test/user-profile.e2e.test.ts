import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { Role } from 'common/auth'
import { PatchUserDto, UserDto } from 'user/dto'
import { uuid } from 'utils/misc'
import { sleep } from 'utils/timers'

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

  test('Get empty user data', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Test',
        type: 'access',
        roles: [Role.OrgAdmin],
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
    const userProfileResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(userProfileResponse.status).toBe(200)
    expect(userProfileResponse.body).toEqual({} satisfies UserDto)
  })

  test('Patch issuer name', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Test',
        type: 'access',
        roles: [Role.OrgAdmin],
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
    const userProfileResponse = await request(app)
      .patch('/user')
      .auth(userAuthToken, { type: 'bearer' })
      .send({ name: 'ABCD' } satisfies PatchUserDto)

    expect(userProfileResponse.status).toBe(200)
    expect(userProfileResponse.body).toEqual({
      name: 'ABCD',
      registeredAt: expect.stringMatching(/\d{4}(.\d{2}){2}(\s|T)(\d{2}.){2}\d{2}/g),
    })
  })

  test('Patch background color', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Test',
        type: 'access',
        roles: [Role.OrgAdmin],
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
    const userProfileResponse = await request(app)
      .patch('/user')
      .auth(userAuthToken, { type: 'bearer' })
      .send({ backgroundColor: '#fff' } satisfies PatchUserDto)

    expect(userProfileResponse.status).toBe(200)
    expect(userProfileResponse.body).toEqual({
      backgroundColor: '#fff',
      registeredAt: expect.stringMatching(/\d{4}(.\d{2}){2}(\s|T)(\d{2}.){2}\d{2}/g),
    })
  })

  test('Patch background color and name', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Test',
        type: 'access',
        roles: [Role.OrgAdmin],
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
    const userProfileResponse = await request(app)
      .patch('/user')
      .auth(userAuthToken, { type: 'bearer' })
      .send({ backgroundColor: '#fff', name: 'XXX' } satisfies PatchUserDto)

    expect(userProfileResponse.status).toBe(200)
    expect(userProfileResponse.body).toEqual({
      name: 'XXX',
      backgroundColor: '#fff',
      registeredAt: expect.stringMatching(/\d{4}(.\d{2}){2}(\s|T)(\d{2}.){2}\d{2}/g),
    })
  })
})
