import { Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { Role } from 'src/common/auth'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'

describe('E2E wallet scope', () => {
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
    await sleep(2000)

    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clear()
    await orm.close(true)
  })

  // Wallets do not depend on the role model mode, so these run with enforcement off

  const createDid = async (authToken: string) => {
    const response = await request(app).post('/dids').auth(authToken, { type: 'bearer' })
    expect(response.status).toBe(201)
  }

  const createSchema = async (authToken: string, name: string) => {
    const response = await request(app)
      .post('/v2/schemas')
      .auth(authToken, { type: 'bearer' })
      .send({ name, fields: ['name'] })
    expect(response.status).toBe(201)
  }

  const getSchemaNames = async (authToken: string): Promise<string[]> => {
    const response = await request(app).get('/v2/schemas').auth(authToken, { type: 'bearer' })
    expect(response.status).toBe(200)
    return (response.body.items as Array<{ name: string }>).map((item) => item.name)
  }

  test('every Admin acts in the shared Administration identity wallet', async () => {
    const firstAdminAuthToken = await createAuthToken(uuid(), Role.Admin)
    const secondAdminAuthToken = await createAuthToken(uuid(), Role.Admin)
    const userAuthToken = await createAuthToken(uuid(), Role.User)

    await createDid(firstAdminAuthToken)

    expect(await getOwnDidsCount(secondAdminAuthToken)).toBe(1)
    expect(await getOwnDidsCount(userAuthToken)).toBe(0)
  })

  test('OrgAdmin and OrgManager act in the organization identity wallet; members do not', async () => {
    const bigOrgId = uuid()
    const smallOrgId = uuid()

    const bigOrgAdminAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, bigOrgId)
    const bigOrgManagerAuthToken = await createAuthToken(uuid(), Role.OrgManager, bigOrgId)
    const bigOrgMemberAuthToken = await createAuthToken(uuid(), Role.OrgMember, bigOrgId)
    const smallOrgAdminAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, smallOrgId)

    await createDid(bigOrgAdminAuthToken)
    await createSchema(bigOrgAdminAuthToken, 'Organization schema')

    expect(await getOwnDidsCount(bigOrgManagerAuthToken)).toBe(1)
    // Resources belong to the organization wallet, not to the actor who created them
    expect(await getSchemaNames(bigOrgManagerAuthToken)).toEqual(['Organization schema'])

    expect(await getOwnDidsCount(bigOrgMemberAuthToken)).toBe(0)
    expect(await getSchemaNames(bigOrgMemberAuthToken)).toEqual([])
    expect(await getOwnDidsCount(smallOrgAdminAuthToken)).toBe(0)
  })

  test('OrgMember, Issuer and Verifier of one user share a personal member wallet per organization', async () => {
    const bigOrgId = uuid()
    const smallOrgId = uuid()
    const memberId = uuid()

    const issuerAuthToken = await createAuthToken(memberId, Role.Issuer, bigOrgId)
    const verifierAuthToken = await createAuthToken(memberId, Role.Verifier, bigOrgId)
    const orgMemberAuthToken = await createAuthToken(memberId, Role.OrgMember, bigOrgId)
    const otherOrgIssuerAuthToken = await createAuthToken(memberId, Role.Issuer, smallOrgId)
    const otherMemberAuthToken = await createAuthToken(uuid(), Role.Issuer, bigOrgId)

    await createDid(issuerAuthToken)
    await createSchema(issuerAuthToken, 'Personal schema')

    // A role change within the membership keeps the wallet and its resources
    expect(await getOwnDidsCount(verifierAuthToken)).toBe(1)
    expect(await getOwnDidsCount(orgMemberAuthToken)).toBe(1)
    expect(await getSchemaNames(orgMemberAuthToken)).toEqual(['Personal schema'])

    expect(await getOwnDidsCount(otherOrgIssuerAuthToken)).toBe(0)
    expect(await getOwnDidsCount(otherMemberAuthToken)).toBe(0)
    expect(await getSchemaNames(otherMemberAuthToken)).toEqual([])
  })

  async function getOwnDidsCount(authToken: string): Promise<number> {
    const getOwnDidsResponse = await request(app).get('/dids').query({ own: true }).auth(authToken, { type: 'bearer' })

    expect(getOwnDidsResponse.status).toBe(200)
    expect(getOwnDidsResponse.body).toEqual(expect.any(Array))

    return (getOwnDidsResponse.body as any[]).length
  }
})
