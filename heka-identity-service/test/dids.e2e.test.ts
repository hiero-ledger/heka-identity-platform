import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { DID_PATTERN } from 'src/__tests__/constants'
import { Role } from 'src/common/auth'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'

describe('E2E public DIDs creation', () => {
  let ormSchemaGenerator: SchemaGenerator

  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    const orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.getSchemaGenerator()
  })

  beforeEach(async () => {
    await ormSchemaGenerator.refreshDatabase()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterEach(async () => {
    // TODO: Find a way to explicitly await the required condition
    // Give AFJ event listeners some time to process pending events
    await sleep(4000)

    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clearDatabase()
  })

  test.skip('only one public DID per wallet can be created', async () => {
    let postDidResponse: request.Response

    const firstAdminId = uuid()
    const firstAdminAuthToken = await createAuthToken(firstAdminId, Role.Admin)

    postDidResponse = await request(app).post('/dids').auth(firstAdminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)

    postDidResponse = await request(app).post('/dids').auth(firstAdminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(409)

    const secondAdminId = uuid()
    const secondAdminAuthToken = await createAuthToken(secondAdminId, Role.Admin)

    postDidResponse = await request(app).post('/dids').auth(secondAdminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(409)

    const firstOrgId = uuid()
    const firstOrgAdminId = uuid()
    const firstOrgAdminAuthToken = await createAuthToken(firstOrgAdminId, Role.OrgAdmin, firstOrgId)

    postDidResponse = await request(app).post('/dids').auth(firstOrgAdminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)

    postDidResponse = await request(app).post('/dids').auth(firstOrgAdminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(409)

    const firstIssuerId = uuid()
    const firstIssuerInFirstOrgAuthToken = await createAuthToken(firstIssuerId, Role.Issuer, firstOrgId)

    postDidResponse = await request(app).post('/dids').auth(firstIssuerInFirstOrgAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)

    postDidResponse = await request(app).post('/dids').auth(firstIssuerInFirstOrgAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(409)

    const secondIssuerId = uuid()
    const secondIssuerInFirstOrgAuthToken = await createAuthToken(secondIssuerId, Role.Issuer, firstOrgId)

    postDidResponse = await request(app).post('/dids').auth(secondIssuerInFirstOrgAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)

    const secondOrgId = uuid()
    const secondOrgAdminId = uuid()
    const secondOrgAdminAuthToken = await createAuthToken(secondOrgAdminId, Role.OrgAdmin, secondOrgId)

    postDidResponse = await request(app).post('/dids').auth(secondOrgAdminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)

    const firstIssuerInSecondOrgAuthToken = await createAuthToken(firstIssuerId, Role.Issuer, secondOrgId)

    postDidResponse = await request(app).post('/dids').auth(firstIssuerInSecondOrgAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)
  })

  test.skip('public DID cannot be created if DID controller is required but has not been created yet', async () => {
    let postDidResponse: request.Response

    const firstOrgId = uuid()

    const issuerId = uuid()
    const issuerInFirstOrgAuthToken = await createAuthToken(issuerId, Role.Issuer, firstOrgId)

    postDidResponse = await request(app).post('/dids').auth(issuerInFirstOrgAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(422)

    const firstOrgAdminId = uuid()
    const firstOrgAdminAuthToken = await createAuthToken(firstOrgAdminId, Role.OrgAdmin, firstOrgId)

    postDidResponse = await request(app).post('/dids').auth(firstOrgAdminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(422)

    const adminId = uuid()
    const adminAuthToken = await createAuthToken(adminId, Role.Admin)

    postDidResponse = await request(app).post('/dids').auth(adminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)

    postDidResponse = await request(app).post('/dids').auth(firstOrgAdminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)

    const secondOrgId = uuid()

    const issuerInSecondOrgAuthToken = await createAuthToken(issuerId, Role.Issuer, secondOrgId)

    postDidResponse = await request(app).post('/dids').auth(issuerInSecondOrgAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(422)

    postDidResponse = await request(app).post('/dids').auth(issuerInFirstOrgAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)
  })

  async function testDidCreation(testCase: { method: string; expected: string }) {
    const firstAdminId = uuid()
    const firstAdminAuthToken = await createAuthToken(firstAdminId, Role.Admin)

    const postDidResponse = await request(app)
      .post('/dids')
      .send({ method: testCase.method })
      .auth(firstAdminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)
    expect(postDidResponse.body).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(testCase.expected),
      }),
    )
  }

  test('did:key create', async () => {
    await testDidCreation({
      method: 'key',
      expected: `^did:key:`,
    })
  })

  test('did:indy create', async () => {
    await testDidCreation({
      method: 'indy',
      expected: `^did:indy:bcovrin:test:${DID_PATTERN}`,
    })
  })

  test('did:hedera create', async () => {
    await testDidCreation({
      method: 'hedera',
      expected: `^did:hedera:`,
    })
  })

  // Need to add Indy-Besu network to CI
  test.skip('did:indybesu create', async () => {
    await testDidCreation({
      method: 'indybesu',
      expected: `^did:indybesu:`,
    })
  })
})
