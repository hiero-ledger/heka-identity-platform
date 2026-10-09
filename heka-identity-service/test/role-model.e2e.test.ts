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

const PLATFORM_ORG_ID = 'platform-org'
const orgRoles = new Set([Role.OrgAdmin, Role.OrgManager, Role.OrgMember, Role.Issuer, Role.Verifier])
const tokenFor = (role: Role, userId: string = uuid(), orgId: string = PLATFORM_ORG_ID) =>
  createAuthToken(userId, role, orgRoles.has(role) ? orgId : undefined)

describe('E2E role model', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>
  let nestApp: INestApplication
  let app: Server

  const startApp = async (
    roleModelEnabled: boolean,
    { keepData = false, storeId }: { keepData?: boolean; storeId?: string } = {},
  ) => {
    if (!keepData) await ormSchemaGenerator.refresh()
    nestApp = await startTestApp({ roleModelEnabled, storeId })
    app = nestApp.getHttpServer() as Server
  }

  const post = (path: string, token: string, body: object = {}) =>
    request(app).post(path).auth(token, { type: 'bearer' }).send(body)

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
  })

  afterEach(async () => {
    await sleep(2000)
    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clear()
    await orm.close(true)
  })

  describe('disabled (default): self-service onboarding', () => {
    beforeEach(() => startApp(false))

    // A self-registered user gets the `User` role from the OIDC provider recipes (Keycloak default group, Auth0 Action)
    test('a sign-up (User) prepares its own wallet and can use every endpoint', async () => {
      const token = await tokenFor(Role.User)

      const prepareResponse = await post('/prepare-wallet', token)
      expect(prepareResponse.status).toBe(201)
      expect(prepareResponse.body.did).toMatch(/^did:key:/)

      const schemaResponse = await post('/v2/schemas', token, { name: 'Diploma', fields: ['name'] })
      expect(schemaResponse.status).toBe(201)

      const invitationResponse = await post('/connections/create-invitation', token, { label: 'Me' })
      expect(invitationResponse.status).toBe(200)
    })

    test('two sign-ups are isolated', async () => {
      const aliceToken = await tokenFor(Role.User)
      const bobToken = await tokenFor(Role.User)

      const aliceDid = (await post('/prepare-wallet', aliceToken)).body.did
      const bobDid = (await post('/prepare-wallet', bobToken)).body.did
      expect(aliceDid).not.toBe(bobDid)

      const bobDids = await request(app).get('/dids').query({ own: true }).auth(bobToken, { type: 'bearer' })
      expect((bobDids.body as Array<{ id: string }>).map((d) => d.id)).not.toContain(aliceDid)
    })
  })

  describe('concurrent wallet preparation', () => {
    beforeEach(() => startApp(false))

    test('concurrent prepare-wallet calls for one wallet all succeed with the same main DID', async () => {
      // Every Admin acts in the shared Administration wallet
      const tokens = await Promise.all([tokenFor(Role.Admin), tokenFor(Role.Admin), tokenFor(Role.Admin)])

      const responses = await Promise.all(tokens.map((token) => post('/prepare-wallet', token)))

      expect(responses.map((response) => response.status)).toEqual([201, 201, 201])
      expect(new Set(responses.map((response) => response.body.did as string)).size).toBe(1)
    })
  })

  describe('enabled: endpoint role restrictions', () => {
    beforeEach(() => startApp(true))

    // Every route has an explicit decision (@Roles or @AnyRole); see src/common/authz/__tests__/route-coverage.test.ts
    test.each([
      ['get', '/dids?own=true', Role.User, true],
      ['patch', '/user', Role.OrgMember, true],
      ['post', '/connections/accept-invitation', Role.User, true],
      ['post', '/connections/accept-invitation', Role.OrgMember, false],
      ['post', '/connections/create-invitation', Role.User, false],
      ['post', '/connections/create-invitation', Role.Verifier, true],
      ['post', '/dids', Role.OrgManager, false],
      ['post', '/dids', Role.Verifier, true],
      ['post', '/dids', Role.OrgMember, false],
      ['post', '/dids', Role.Admin, true],
      ['post', '/credentials/offer', Role.Verifier, false],
      ['post', '/proofs/request', Role.Issuer, true],
      ['post', '/proofs/request', Role.User, false],
      ['post', '/openid4vc/verifier', Role.Issuer, false],
      // Former bypasses: these writes had no role list before
      ['post', '/v2/credentials/offer-by-template', Role.Verifier, false],
      ['post', '/v2/credentials/offer-by-template', Role.User, false],
      ['post', '/v2/credentials/offer-by-template', Role.Issuer, true],
      ['post', '/v2/credentials/proof-by-template', Role.Verifier, true],
      ['post', '/v2/credentials/proof-by-template', Role.User, false],
      ['post', '/v2/schemas', Role.Verifier, false],
      ['post', '/v2/schemas', Role.OrgManager, true],
      ['post', '/issuance-templates', Role.User, false],
      ['post', '/verification-templates', Role.Verifier, true],
      ['post', '/verification-templates', Role.OrgMember, false],
      // Reads are open to every authenticated role
      ['get', '/status-lists/00000000-0000-0000-0000-000000000000', Role.User, true],
      ['get', '/revocation-registries/x', Role.Issuer, true],
      ['get', '/user', Role.OrgMember, true],
    ])('%s %s as %s is allowed=%s', async (method: string, path: string, role: Role, allowed: boolean) => {
      const token = await tokenFor(role)

      const response = await (request(app) as unknown as Record<string, (p: string) => request.Test>)
        [method](path)
        .auth(token, { type: 'bearer' })
        .send({})

      if (allowed) {
        expect(response.status).not.toBe(403)
      } else {
        expect(response.status).toBe(403)
      }
    })

    test('a role that cannot create a public DID cannot prepare a wallet', async () => {
      const token = await tokenFor(Role.User)

      expect((await request(app).get('/dids').query({ own: true }).auth(token, { type: 'bearer' })).status).toBe(200)
      expect((await post('/prepare-wallet', token)).status).toBe(403)
    })
  })

  describe('switching the flag', () => {
    test('a wallet keeps its data when the role model is turned on; only permissions change', async () => {
      const userId = uuid()
      const token = await tokenFor(Role.User, userId)

      // Both starts use one agent store, so the second app sees the tenants of the first
      const storeId = `tenant-${uuid()}`
      await startApp(false, { storeId })
      const did = (await post('/prepare-wallet', token)).body.did as string
      expect((await post('/v2/schemas', token, { name: 'Diploma', fields: ['name'] })).status).toBe(201)
      await sleep(2000)
      await nestApp.close()

      await startApp(true, { keepData: true, storeId })
      const dids = await request(app).get('/dids').query({ own: true }).auth(token, { type: 'bearer' })
      expect((dids.body as Array<{ id: string }>).map((d) => d.id)).toContain(did)
      const schemas = await request(app).get('/v2/schemas').auth(token, { type: 'bearer' })
      expect(schemas.status).toBe(200)
      expect(JSON.stringify(schemas.body)).toContain('Diploma')
      // ...but a User may no longer create schemas
      expect((await post('/v2/schemas', token, { name: 'Other', fields: ['name'] })).status).toBe(403)
    })
  })

  describe('enabled: prepare-wallet by role', () => {
    const orgId = uuid()

    const bootstrapOrganization = async () => {
      expect((await post('/prepare-wallet', await tokenFor(Role.Admin))).status).toBe(201)
      expect((await post('/prepare-wallet', await tokenFor(Role.OrgAdmin, uuid(), orgId))).status).toBe(201)
    }

    beforeEach(() => startApp(true))

    test('an Issuer prepares its wallet before the organization; only DIDs that need a controller wait', async () => {
      const token = await tokenFor(Role.Issuer, uuid(), orgId)

      // The main did:key has no controller, so preparation does not depend on the organization
      const prepareResponse = await post('/prepare-wallet', token)
      expect(prepareResponse.status).toBe(201)
      expect(prepareResponse.body.did).toMatch(/^did:key:/)

      // A did:hedera is controlled by the organization's did:hedera, which does not exist yet
      expect((await post('/dids', token, { method: 'hedera' })).status).toBe(422)
    })

    test('a Verifier prepares its own wallet with a did:key, but may not create a ledger DID', async () => {
      const token = await tokenFor(Role.Verifier, uuid(), orgId)

      const prepareResponse = await post('/prepare-wallet', token)
      expect(prepareResponse.status).toBe(201)
      expect(prepareResponse.body.did).toMatch(/^did:key:/)

      expect((await post('/dids', token, { method: 'hedera' })).status).toBe(403)
      // It can now create the verifier its verification requests are signed with
      expect(
        (await post('/openid4vc/verifier', token, { publicVerifierId: prepareResponse.body.did })).status,
      ).not.toBe(403)
    })

    test('an OrgManager gets 403 until an OrgAdmin has prepared the organization wallet, then its DID', async () => {
      const managerToken = await tokenFor(Role.OrgManager, uuid(), orgId)
      expect((await post('/prepare-wallet', managerToken)).status).toBe(403)

      await bootstrapOrganization()

      const orgAdminDid = (await post('/prepare-wallet', await tokenFor(Role.OrgAdmin, uuid(), orgId))).body.did
      const managerResponse = await post('/prepare-wallet', managerToken)
      expect(managerResponse.status).toBe(201)
      expect(managerResponse.body.did).toBe(orgAdminDid)
    })
  })
})
