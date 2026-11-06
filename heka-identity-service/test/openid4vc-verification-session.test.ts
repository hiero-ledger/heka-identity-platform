import { Server } from 'net'

import { Agent, DidKey, KeyDidCreateOptions, SdJwtVcRecord } from '@credo-ts/core'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { Role } from 'src/common/auth'
import { parseDidMethods } from 'src/config/insecure-defaults'
import { uuid } from 'src/utils/misc'

import { initializeMikroOrm, startTestApp, waitUntil } from './helpers'
import { createAuthToken } from './helpers/jwt'
import { createAgent, TestAgentModulesMap } from './helpers/test-agent'

// `indybesu` needs a local Indy-Besu network (see docs/setup.md, "Local Indy-Besu network")
const didMethods = parseDidMethods(process.env)

describe('E2E verification session', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server
  let agent: Agent<TestAgentModulesMap>

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema

    await ormSchemaGenerator.refresh()

    agent = createAgent()
    await agent.initialize()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server

    const issuerDidKeyResult = await agent.kms.createKey({
      type: {
        kty: 'OKP',
        crv: 'Ed25519',
      },
    })
    const issuerDidResult = await agent.dids.create<KeyDidCreateOptions>({
      method: 'key',
      options: {
        keyId: issuerDidKeyResult.keyId,
      },
    })
    const holderDidKeyResult = await agent.kms.createKey({
      type: {
        kty: 'OKP',
        crv: 'Ed25519',
      },
    })
    const holderDidResult = await agent.dids.create<KeyDidCreateOptions>({
      method: 'key',
      options: {
        keyId: holderDidKeyResult.keyId,
      },
    })
    const issuerDidKey = DidKey.fromDid(issuerDidResult.didState.did as string)
    const holderDidKey = DidKey.fromDid(holderDidResult.didState.did as string)
    const sdJwtVc = await agent.sdJwtVc.sign({
      holder: {
        didUrl: `${holderDidKey.did}#${holderDidKey.publicJwk.fingerprint}`,
        method: 'did',
      },
      issuer: {
        didUrl: `${issuerDidKey.did}#${issuerDidKey.publicJwk.fingerprint}`,
        method: 'did',
      },
      payload: {
        vct: 'https://example.com/vct',
        first_name: 'John',
        age: {
          over_21: true,
          over_18: true,
          over_65: false,
        },
      },
    })
    await agent.sdJwtVc.store({ record: SdJwtVcRecord.fromSdJwtVc(sdJwtVc) })
  })

  afterAll(async () => {
    await nestApp.close()

    await ormSchemaGenerator.clear()
    await orm.close(true)
  })

  test('create request with PEX', async () => {
    const firstAdminId = uuid()
    const firstAdminAuthToken = await createAuthToken(firstAdminId, Role.User)

    const postDidResponse = await request(app).post('/dids').auth(firstAdminAuthToken, { type: 'bearer' }).send({})
    expect(postDidResponse.statusCode).toBe(201)
    const verifierId = postDidResponse.body.id

    const verifierResponse = await request(app)
      .post(`/openid4vc/verifier`)
      .auth(firstAdminAuthToken, { type: 'bearer' })
      .send({
        publicVerifierId: verifierId,
      })

    expect(verifierResponse.statusCode).toBe(200)

    const response = await request(app)
      .post(`/openid4vc/verification-session/request`)
      .auth(firstAdminAuthToken, { type: 'bearer' })
      .send({
        publicVerifierId: verifierId,
        requestSigner: {
          method: 'did',
          did: postDidResponse.body.authentication[0],
        },
        presentationExchange: {
          definition: {
            id: '73797b0c-dae6-46a7-9700-7850855fee22',
            name: 'Example Presentation Definition',
            input_descriptors: [
              {
                id: '64125742-8b6c-422e-82cd-1beb5123ee8f',
                constraints: {
                  limit_disclosure: 'required',
                  fields: [
                    {
                      path: ['$.age.over_18'],
                      filter: {
                        type: 'boolean',
                      },
                    },
                  ],
                },
                name: 'Requested Sd Jwt Example Credential',
                purpose: 'To provide an example of requesting a credential',
              },
            ],
          },
        },
      })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      verificationSession: {
        createdAt: expect.any(String),
        id: expect.any(String),
        publicVerifierId: expect.any(String),
        state: 'RequestCreated',
        type: 'OpenId4VcVerificationSessionRecord',
        updatedAt: expect.any(String),
        authorizationRequestUri: expect.stringMatching(
          new RegExp(`/oid4vp/${verifierId}/authorization-requests/[^/]+$`),
        ),
        authorizationRequestJwt: expect.any(String),
      },
      authorizationRequest: expect.stringMatching(
        new RegExp(
          new RegExp(
            `^openid4vp://\\?client_id=${encodeURIComponent(verifierId)}&request_uri=` +
              `http[^/]+` +
              encodeURIComponent(`/oid4vp/${verifierId}/authorization-requests/`).replace(/\./g, '\\.') +
              `[^/]+$`,
          ),
        ),
      ),
    })

    const resolvedRequest = await agent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest(
      response.body.authorizationRequest,
    )

    const selectedCredentials = agent.openid4vc.holder.selectCredentialsForPresentationExchangeRequest(
      resolvedRequest.presentationExchange!.credentialsForRequest,
    )

    const res = await agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest({
      authorizationRequestPayload: resolvedRequest.authorizationRequestPayload,
      presentationExchange: {
        credentials: selectedCredentials,
      },
    })

    expect(res.serverResponse?.status).toEqual(200)
  })

  test('create request with DCQL', async () => {
    const firstAdminId = uuid()
    const firstAdminAuthToken = await createAuthToken(firstAdminId, Role.User)

    const postDidResponse = await request(app).post('/dids').auth(firstAdminAuthToken, { type: 'bearer' }).send({})
    expect(postDidResponse.statusCode).toBe(201)
    const verifierId = postDidResponse.body.id

    const verifierResponse = await request(app)
      .post(`/openid4vc/verifier`)
      .auth(firstAdminAuthToken, { type: 'bearer' })
      .send({
        publicVerifierId: verifierId,
      })

    expect(verifierResponse.statusCode).toBe(200)

    const response = await request(app)
      .post(`/openid4vc/verification-session/request`)
      .auth(firstAdminAuthToken, { type: 'bearer' })
      .send({
        publicVerifierId: verifierId,
        requestSigner: {
          method: 'did',
          did: postDidResponse.body.authentication[0],
        },
        dcql: {
          query: {
            credentials: [
              {
                id: 'credential_1',
                format: 'vc+sd-jwt',
                meta: {
                  vct_values: ['https://example.com/vct'],
                },
                claims: [
                  {
                    path: ['first_name'],
                    id: 'first_name_claim',
                  },
                ],
              },
            ],
          },
        },
      })

    if (response.statusCode !== 200) {
      console.error(JSON.stringify(response.body, null, 2))
    }
    expect(response.statusCode).toBe(200)
    expect(response.body.verificationSession.state).toBe('RequestCreated')

    const resolvedRequest = await agent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest(
      response.body.authorizationRequest,
    )

    expect(resolvedRequest.dcql).toBeDefined()

    const selectedCredentials = agent.openid4vc.holder.selectCredentialsForDcqlRequest(
      resolvedRequest.dcql!.queryResult,
    )

    const res = await agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest({
      authorizationRequestPayload: resolvedRequest.authorizationRequestPayload,
      dcql: {
        credentials: selectedCredentials,
      },
    })

    expect(res.serverResponse?.status).toEqual(200)
    // Wait for event processing and verify the session contains shared attributes
    const sessionId = response.body.verificationSession.id

    let getSessionResponse!: request.Response
    await waitUntil(
      async () => {
        getSessionResponse = await request(app)
          .get(`/openid4vc/verification-session/${sessionId}`)
          .auth(firstAdminAuthToken, { type: 'bearer' })
        return getSessionResponse.statusCode === 200 && getSessionResponse.body.state === 'ResponseVerified'
      },
      { message: 'Verification session did not reach ResponseVerified' },
    )

    expect(getSessionResponse.statusCode).toBe(200)
    expect(getSessionResponse.body.state).toBe('ResponseVerified')
    expect(getSessionResponse.body.sharedAttributes).toBeDefined()
    expect(getSessionResponse.body.sharedAttributes.first_name).toBe('John')
  })

  test.skipIf(!didMethods.includes('indybesu'))('sign the request with a key named by `keyId`', async () => {
    const token = await createAuthToken(uuid(), Role.Admin)

    const postDidResponse = await request(app)
      .post('/dids')
      .auth(token, { type: 'bearer' })
      .send({ method: 'indybesu' })
    expect(postDidResponse.statusCode).toBe(201)
    const verifierId = postDidResponse.body.id as string
    // The did:indybesu own key is secp256k1 (ES256K); the added key is Ed25519
    const updateResponse = await request(app)
      .patch(`/dids/${verifierId}`)
      .auth(token, { type: 'bearer' })
      .send({ addVerificationMethods: [{ id: '#signing-key' }] })
    expect(updateResponse.statusCode).toBe(200)

    const verifierResponse = await request(app)
      .post('/openid4vc/verifier')
      .auth(token, { type: 'bearer' })
      .send({ publicVerifierId: verifierId })
    expect(verifierResponse.statusCode).toBe(200)

    const response = await request(app)
      .post('/openid4vc/verification-session/request')
      .auth(token, { type: 'bearer' })
      .send({
        publicVerifierId: verifierId,
        requestSigner: { method: 'did', did: verifierId, keyId: '#signing-key' },
        dcql: {
          query: {
            credentials: [
              {
                id: 'credential_1',
                format: 'vc+sd-jwt',
                meta: { vct_values: ['https://example.com/vct'] },
                claims: [{ path: ['first_name'] }],
              },
            ],
          },
        },
      })
    expect(response.statusCode).toBe(200)

    const jwt = response.body.verificationSession.authorizationRequestJwt as string
    const header = JSON.parse(Buffer.from(jwt.split('.')[0], 'base64url').toString())
    expect(header).toMatchObject({ alg: 'EdDSA', kid: `${verifierId}#signing-key` })

    // Resolving verifies the request signature against the verifier's DID document
    const resolvedRequest = await agent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest(
      response.body.authorizationRequest,
    )
    expect(resolvedRequest.dcql).toBeDefined()
  })
})
