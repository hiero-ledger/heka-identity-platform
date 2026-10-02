import { Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
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
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
  })

  beforeEach(async () => {
    await ormSchemaGenerator.refresh()

    nestApp = await startTestApp({ roleModelEnabled: true })
    app = nestApp.getHttpServer() as Server
  })

  afterEach(async () => {
    // TODO: Find a way to explicitly await the required condition
    // Give AFJ event listeners some time to process pending events
    await sleep(4000)

    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clear()
    await orm.close(true)
  })

  const postDid = (token: string, method?: string) =>
    request(app)
      .post('/dids')
      .send(method ? { method } : {})
      .auth(token, { type: 'bearer' })

  test('only one main-method (key) DID per wallet; other methods are not limited', async () => {
    const firstAdminToken = await createAuthToken(uuid(), Role.Admin)
    const secondAdminToken = await createAuthToken(uuid(), Role.Admin)

    expect((await postDid(firstAdminToken)).status).toBe(201)
    // Every Admin acts in the shared Administration wallet, which already has its main DID
    expect((await postDid(secondAdminToken)).status).toBe(409)
    expect((await postDid(secondAdminToken, 'indy')).status).toBe(201)
  })

  test('roles without the did capability cannot create a public DID', async () => {
    const orgId = uuid()
    for (const token of [
      await createAuthToken(uuid(), Role.OrgManager, orgId),
      await createAuthToken(uuid(), Role.OrgMember, orgId),
      await createAuthToken(uuid(), Role.User),
    ]) {
      expect((await postDid(token)).status).toBe(403)
    }
  })

  test('the DID controller chain Admin -> OrgAdmin -> Issuer / Verifier is a prerequisite', async () => {
    const orgId = uuid()
    const adminToken = await createAuthToken(uuid(), Role.Admin)
    const orgAdminToken = await createAuthToken(uuid(), Role.OrgAdmin, orgId)
    const issuerToken = await createAuthToken(uuid(), Role.Issuer, orgId)
    const verifierToken = await createAuthToken(uuid(), Role.Verifier, orgId)

    expect((await postDid(orgAdminToken)).status).toBe(422)
    expect((await postDid(issuerToken)).status).toBe(422)
    expect((await postDid(verifierToken)).status).toBe(422)

    expect((await postDid(adminToken)).status).toBe(201)
    expect((await postDid(issuerToken)).status).toBe(422)

    expect((await postDid(orgAdminToken)).status).toBe(201)
    expect((await postDid(issuerToken)).status).toBe(201)
    expect((await postDid(verifierToken)).status).toBe(201)
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
