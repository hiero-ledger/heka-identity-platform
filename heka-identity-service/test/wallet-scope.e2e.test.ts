import { Server } from 'net'

import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { Role } from 'src/common/auth'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'

describe('E2E wallet scope', () => {
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
    await sleep(2000)

    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clearDatabase()
  })

  test.skip('users with Admin role share administartion wallet', async () => {
    const orgId = uuid()

    const firstAdminId = uuid()
    const secondAdminId = uuid()
    const orgAdminId = uuid()
    const orgManagerId = uuid()
    const orgMemberId = uuid()
    const issuerId = uuid()
    const verifierId = uuid()
    const userId = uuid()

    const firstAdminAuthToken = await createAuthToken(firstAdminId, Role.Admin)
    const secondAdminAuthToken = await createAuthToken(secondAdminId, Role.Admin)
    const orgAdminAuthToken = await createAuthToken(orgAdminId, Role.OrgAdmin, orgId)
    const orgManagerAuthToken = await createAuthToken(orgManagerId, Role.OrgManager, orgId)
    const orgMemberAuthToken = await createAuthToken(orgMemberId, Role.OrgMember, orgId)
    const issuerAuthToken = await createAuthToken(issuerId, Role.Issuer, orgId)
    const verifierAuthToken = await createAuthToken(verifierId, Role.Verifier, orgId)
    const userAuthToken = await createAuthToken(userId, Role.User)

    expect(await getOwnDidsCount(firstAdminAuthToken)).toBe(0)
    expect(await getOwnDidsCount(secondAdminAuthToken)).toBe(0)
    expect(await getOwnDidsCount(orgAdminAuthToken)).toBe(0)
    expect(await getOwnDidsCount(orgManagerAuthToken)).toBe(0)
    expect(await getOwnDidsCount(orgMemberAuthToken)).toBe(0)
    expect(await getOwnDidsCount(issuerAuthToken)).toBe(0)
    expect(await getOwnDidsCount(verifierAuthToken)).toBe(0)
    expect(await getOwnDidsCount(userAuthToken)).toBe(0)

    const postDidResponse = await request(app).post('/dids').auth(firstAdminAuthToken, { type: 'bearer' })
    expect(postDidResponse.status).toBe(201)

    expect(await getOwnDidsCount(firstAdminAuthToken)).toBe(1)
    expect(await getOwnDidsCount(secondAdminAuthToken)).toBe(1)
    expect(await getOwnDidsCount(orgAdminAuthToken)).toBe(0)
    expect(await getOwnDidsCount(orgManagerAuthToken)).toBe(0)
    expect(await getOwnDidsCount(orgMemberAuthToken)).toBe(0)
    expect(await getOwnDidsCount(issuerAuthToken)).toBe(0)
    expect(await getOwnDidsCount(verifierAuthToken)).toBe(0)
    expect(await getOwnDidsCount(userAuthToken)).toBe(0)
  })

  test.skip('organization administrartion users share organization wallet', async () => {
    const bigOrgId = uuid()
    const smallOrgId = uuid()

    const adminId = uuid()
    const bigOrgAdminId = uuid()
    const smallOrgAdminId = uuid()
    const bigOrgManagerId = uuid()
    const smallOrgManagerId = uuid()
    const bigOrgMemberId = uuid()
    const smallOrgMemberId = uuid()
    const issuerId = uuid()
    const verifierId = uuid()
    const userId = uuid()

    const adminAuthToken = await createAuthToken(adminId, Role.Admin)
    const bigOrgAdminAuthToken = await createAuthToken(bigOrgAdminId, Role.OrgAdmin, bigOrgId)
    const smallOrgAdminAuthToken = await createAuthToken(smallOrgAdminId, Role.OrgAdmin, smallOrgId)
    const bigOrgManagerAuthToken = await createAuthToken(bigOrgManagerId, Role.OrgManager, bigOrgId)
    const smallOrgManagerAuthToken = await createAuthToken(smallOrgManagerId, Role.OrgManager, smallOrgId)
    const bigOrgMemberAuthToken = await createAuthToken(bigOrgMemberId, Role.OrgMember, bigOrgId)
    const smallOrgMemberAuthToken = await createAuthToken(smallOrgMemberId, Role.OrgMember, smallOrgId)
    const issuerAuthToken = await createAuthToken(issuerId, Role.Issuer, bigOrgId)
    const verifierAuthToken = await createAuthToken(verifierId, Role.Verifier, bigOrgId)
    const userAuthToken = await createAuthToken(userId, Role.User)

    let postDidResponse = await request(app).post('/dids').auth(adminAuthToken, { type: 'bearer' })
    expect(postDidResponse.status).toBe(201)

    expect(await getOwnDidsCount(adminAuthToken)).toBe(1)
    expect(await getOwnDidsCount(bigOrgAdminAuthToken)).toBe(0)
    expect(await getOwnDidsCount(smallOrgAdminAuthToken)).toBe(0)
    expect(await getOwnDidsCount(bigOrgManagerAuthToken)).toBe(0)
    expect(await getOwnDidsCount(smallOrgManagerAuthToken)).toBe(0)
    expect(await getOwnDidsCount(bigOrgMemberAuthToken)).toBe(0)
    expect(await getOwnDidsCount(smallOrgMemberAuthToken)).toBe(0)
    expect(await getOwnDidsCount(issuerAuthToken)).toBe(0)
    expect(await getOwnDidsCount(verifierAuthToken)).toBe(0)
    expect(await getOwnDidsCount(userAuthToken)).toBe(0)

    postDidResponse = await request(app).post('/dids').auth(bigOrgAdminAuthToken, { type: 'bearer' })
    expect(postDidResponse.status).toBe(201)

    expect(await getOwnDidsCount(adminAuthToken)).toBe(1)
    expect(await getOwnDidsCount(bigOrgAdminAuthToken)).toBe(1)
    expect(await getOwnDidsCount(smallOrgAdminAuthToken)).toBe(0)
    expect(await getOwnDidsCount(bigOrgManagerAuthToken)).toBe(1)
    expect(await getOwnDidsCount(smallOrgManagerAuthToken)).toBe(0)
    expect(await getOwnDidsCount(bigOrgMemberAuthToken)).toBe(1)
    expect(await getOwnDidsCount(smallOrgMemberAuthToken)).toBe(0)
    expect(await getOwnDidsCount(issuerAuthToken)).toBe(0)
    expect(await getOwnDidsCount(verifierAuthToken)).toBe(0)
    expect(await getOwnDidsCount(userAuthToken)).toBe(0)
  })

  test.skip('user with Issuer role has individual wallet per each his/her organization', async () => {
    const bigOrgId = uuid()
    const smallOrgId = uuid()

    const adminId = uuid()
    const bigOrgAdminId = uuid()
    const bigOrgManagerId = uuid()
    const bigOrgMemberId = uuid()
    const firstIssuerId = uuid()
    const secondIssuerId = uuid()
    const verifierId = uuid()
    const userId = uuid()

    const adminAuthToken = await createAuthToken(adminId, Role.Admin)
    const bigOrgAdminAuthToken = await createAuthToken(bigOrgAdminId, Role.OrgAdmin, bigOrgId)
    const bigOrgManagerAuthToken = await createAuthToken(bigOrgManagerId, Role.OrgManager, bigOrgId)
    const bigOrgMemberAuthToken = await createAuthToken(bigOrgMemberId, Role.OrgMember, bigOrgId)
    const firstIssuerInBigOrgAuthToken = await createAuthToken(firstIssuerId, Role.Issuer, bigOrgId)
    const firstIssuerInSmallOrgAuthToken = await createAuthToken(firstIssuerId, Role.Issuer, smallOrgId)
    const secondIssuerInBigOrgAuthToken = await createAuthToken(secondIssuerId, Role.Issuer, bigOrgId)
    const verifierAuthToken = await createAuthToken(verifierId, Role.Verifier, bigOrgId)
    const userAuthToken = await createAuthToken(userId, Role.User)

    let postDidResponse = await request(app).post('/dids').auth(adminAuthToken, { type: 'bearer' })
    expect(postDidResponse.status).toBe(201)

    postDidResponse = await request(app).post('/dids').auth(bigOrgAdminAuthToken, { type: 'bearer' })
    expect(postDidResponse.status).toBe(201)

    expect(await getOwnDidsCount(adminAuthToken)).toBe(1)
    expect(await getOwnDidsCount(bigOrgAdminAuthToken)).toBe(1)
    expect(await getOwnDidsCount(bigOrgManagerAuthToken)).toBe(1)
    expect(await getOwnDidsCount(bigOrgMemberAuthToken)).toBe(1)
    expect(await getOwnDidsCount(firstIssuerInBigOrgAuthToken)).toBe(0)
    expect(await getOwnDidsCount(firstIssuerInSmallOrgAuthToken)).toBe(0)
    expect(await getOwnDidsCount(secondIssuerInBigOrgAuthToken)).toBe(0)
    expect(await getOwnDidsCount(verifierAuthToken)).toBe(0)
    expect(await getOwnDidsCount(userAuthToken)).toBe(0)

    postDidResponse = await request(app).post('/dids').auth(firstIssuerInBigOrgAuthToken, { type: 'bearer' })
    expect(postDidResponse.status).toBe(201)

    expect(await getOwnDidsCount(adminAuthToken)).toBe(1)
    expect(await getOwnDidsCount(bigOrgAdminAuthToken)).toBe(1)
    expect(await getOwnDidsCount(bigOrgManagerAuthToken)).toBe(1)
    expect(await getOwnDidsCount(bigOrgMemberAuthToken)).toBe(1)
    expect(await getOwnDidsCount(firstIssuerInBigOrgAuthToken)).toBe(1)
    expect(await getOwnDidsCount(firstIssuerInSmallOrgAuthToken)).toBe(0)
    expect(await getOwnDidsCount(secondIssuerInBigOrgAuthToken)).toBe(0)
    expect(await getOwnDidsCount(verifierAuthToken)).toBe(0)
    expect(await getOwnDidsCount(userAuthToken)).toBe(0)
  })

  async function getOwnDidsCount(authToken: string): Promise<number> {
    const getOwnDidsResponse = await request(app).get('/dids').query({ own: true }).auth(authToken, { type: 'bearer' })

    expect(getOwnDidsResponse.status).toBe(200)
    expect(getOwnDidsResponse.body).toEqual(expect.any(Array))

    return (getOwnDidsResponse.body as any[]).length
  }
})
