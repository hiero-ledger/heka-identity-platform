import { Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { Role } from 'src/common/auth'
import { uuid } from 'src/utils/misc'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'

// Credo routes a public OID4VC request (`/oid4vci/<id>/…`, `/oid4vp/<id>/…`) to the first tenant whose record carries
// the id under this tag (`getAgentContextForActorId`, `@credo-ts/openid4vc` `shared/router/tenants`). Creating an
// issuer or a verifier adds its id to the tag of the tenant that creates it.
const CREDO_OPENID4VC_ACTOR_IDS_TAG = '_openid4vc/openId4VcActorIds'

describe('OID4VC issuer and verifier ids are DIDs of the wallet', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
    await ormSchemaGenerator.refresh()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    await nestApp?.close()

    await ormSchemaGenerator?.clear()
    await orm?.close(true)
  })

  // Every organization acts in a wallet of its own (`getWalletId`)
  const organizationAuthToken = () => createAuthToken(uuid(), Role.OrgAdmin, uuid())

  const createDid = async (authToken: string): Promise<string> => {
    const response = await request(app).post('/dids').auth(authToken, { type: 'bearer' }).send({})
    expect(response.statusCode).toBe(201)
    return (response.body as { id: string }).id
  }

  const createIssuer = (authToken: string, publicIssuerId: string, name: string) =>
    request(app)
      .post('/openid4vc/issuer')
      .auth(authToken, { type: 'bearer' })
      .send({
        publicIssuerId,
        display: [{ name }],
        credentialsSupported: [{ id: 'Example', format: 'vc+sd-jwt', vct: 'https://example.com/vct' }],
      })

  const createVerifier = (authToken: string, publicVerifierId: string) =>
    request(app).post('/openid4vc/verifier').auth(authToken, { type: 'bearer' }).send({ publicVerifierId })

  const tenantsRoutedFor = async (actorId: string): Promise<string[]> => {
    const agent = nestApp.get<Agent>(AGENT_TOKEN)
    const tenants = await agent.modules.tenants.findTenantsByQuery({ [CREDO_OPENID4VC_ACTOR_IDS_TAG]: [actorId] })
    return tenants.map(({ id }) => id)
  }

  /** The holder's offer and issuer metadata, fetched as a wallet does: from the public OID4VCI endpoints of the DID. */
  const expectHolderEndpointsServed = async (holderAuthToken: string, did: string) => {
    const offerResponse = await request(app)
      .post('/openid4vc/issuance-session/offer')
      .auth(holderAuthToken, { type: 'bearer' })
      .send({
        publicIssuerId: did,
        credentials: [
          {
            credentialSupportedId: 'Example',
            format: 'vc+sd-jwt',
            issuer: { method: 'did', did },
            payload: { first_name: 'John' },
          },
        ],
      })
    expect(offerResponse.statusCode).toBe(200)
    const { issuanceSession } = offerResponse.body as {
      issuanceSession: { credentialOfferUri: string; credentialOfferPayload: { credential_issuer: string } }
    }

    const offerUri = issuanceSession.credentialOfferUri
    const offer = await fetch(offerUri)
    expect(offer.status, `GET ${offerUri}`).toBe(200)

    const credentialIssuer = new URL(issuanceSession.credentialOfferPayload.credential_issuer)
    const metadataUrl = `${credentialIssuer.origin}/.well-known/openid-credential-issuer${credentialIssuer.pathname}`
    const metadata = await fetch(metadataUrl)
    expect(metadata.status, `GET ${metadataUrl}`).toBe(200)
    expect(((await metadata.json()) as { display?: unknown }).display).toEqual([{ name: 'Holder' }])
  }

  test("another wallet's issuer record for the DID is refused; the DID's OID4VCI endpoints stay with its holder", async () => {
    const holderAuthToken = await organizationAuthToken()
    const otherAuthToken = await organizationAuthToken()
    const did = await createDid(holderAuthToken)
    expect((await createIssuer(holderAuthToken, did, 'Holder')).statusCode).toBe(200)

    const lookalike = await createIssuer(otherAuthToken, did, 'Lookalike')

    await expectHolderEndpointsServed(holderAuthToken, did)
    expect(await tenantsRoutedFor(did)).toHaveLength(1)
    expect(lookalike.statusCode).toBe(422)
  })

  test("another wallet's verifier record for the DID is refused; the DID's OID4VCI endpoints stay with its holder", async () => {
    const holderAuthToken = await organizationAuthToken()
    const otherAuthToken = await organizationAuthToken()
    const did = await createDid(holderAuthToken)
    expect((await createIssuer(holderAuthToken, did, 'Holder')).statusCode).toBe(200)

    const lookalike = await createVerifier(otherAuthToken, did)

    await expectHolderEndpointsServed(holderAuthToken, did)
    expect(await tenantsRoutedFor(did)).toHaveLength(1)
    expect(lookalike.statusCode).toBe(422)
  })

  test('the wallet creates an issuer and a verifier for its own DID', async () => {
    const holderAuthToken = await organizationAuthToken()
    const did = await createDid(holderAuthToken)

    expect((await createIssuer(holderAuthToken, did, 'Holder')).statusCode).toBe(200)
    expect((await createVerifier(holderAuthToken, did)).statusCode).toBe(200)

    await expectHolderEndpointsServed(holderAuthToken, did)
    expect(await tenantsRoutedFor(did)).toHaveLength(1)
  })
})
