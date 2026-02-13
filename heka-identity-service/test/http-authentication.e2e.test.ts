import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, signJwt, startTestApp } from './helpers'

describe('E2E HTTP authentication', () => {
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

  test('authenticates for valid bearer token with Admin role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Administrator',
        type: 'access',
        roles: ['Admin'],
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

  test('authenticates for valid bearer token with OrgAdmin role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['OrgAdmin'],
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

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(200)
  })

  test('authenticates for valid bearer token with OrgManager role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['OrgManager'],
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

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(200)
  })

  test('authenticates for valid bearer token with OrgMember role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['OrgMember'],
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

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(200)
  })

  test('authenticates for valid bearer token with Issuer role', async () => {
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

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(200)
  })

  test('authenticates for valid bearer token with Verifier role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Pharmacist',
        type: 'access',
        roles: ['Verifier'],
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

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(200)
  })

  test('authenticates for valid bearer token with User role', async () => {
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

  test('rejects if bearer token does not contain iss', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      'test',
      {
        subject: uuid(),
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(401)
  })

  test('rejects if bearer token iss is not Heka', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      'test',
      {
        subject: uuid(),
        issuer: 'Heka Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(401)
  })

  test('rejects if bearer token does not contain aud', async () => {
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
        expiresIn: '1w',
      },
    )

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(401)
  })

  test('rejects if bearer token aud is not Heka Identity Service', async () => {
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
        audience: 'Heka Mobile App',
        expiresIn: '1w',
      },
    )

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(401)
  })

  test('rejects if bearer token has expired', async () => {
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
        expiresIn: '1s',
      },
    )

    // Wait for the token to expire
    await sleep(2000)

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(401)
  })

  test('rejects if bearer token roles contains zero elements', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: [],
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

    expect(getUserResponse.status).toBe(401)
  })

  test('rejects if bearer token roles contains multiple elements', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['Admin', 'User'],
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

    expect(getUserResponse.status).toBe(401)
  })

  test('rejects if bearer token contains org_id when must not', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
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

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(401)
  })

  test('rejects if bearer token does not contain org_id when must', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Doctor',
        type: 'access',
        roles: ['Issuer'],
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

    expect(getUserResponse.status).toBe(401)
  })

  test('rejects if bearer token signature is invalid', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      'wrong-secret',
      {
        subject: uuid(),
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    const getUserResponse = await request(app).get('/user').auth(userAuthToken, { type: 'bearer' })

    expect(getUserResponse.status).toBe(401)
  })
})
