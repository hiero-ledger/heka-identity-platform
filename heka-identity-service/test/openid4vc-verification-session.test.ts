import { Server } from 'net'

import { Agent, DidKey, KeyDidCreateOptions } from '@credo-ts/core'
import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { Role } from 'src/common/auth'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'
import { createAgent, TestAgentModulesMap } from './helpers/test-agent'

describe('E2E verification session', () => {
  let ormSchemaGenerator: SchemaGenerator

  let nestApp: INestApplication
  let app: Server
  let agent: Agent<TestAgentModulesMap>

  beforeAll(async () => {
    const orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.getSchemaGenerator()

    await ormSchemaGenerator.refreshDatabase()

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
    await agent.sdJwtVc.store(sdJwtVc.compact)
  })

  afterAll(async () => {
    // TODO: Find a way to explicitly await the required condition
    // Give AFJ event listeners some time to process pending events
    await sleep(2000)

    await nestApp.close()

    await ormSchemaGenerator.clearDatabase()
  })

  test('create request', async () => {
    const firstAdminId = uuid()
    const firstAdminAuthToken = await createAuthToken(firstAdminId, Role.Admin)

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

    const resolvedRequest = await agent.modules.openId4VcHolder.resolveOpenId4VpAuthorizationRequest(
      response.body.authorizationRequest,
    )

    const selectedCredentials = agent.modules.openId4VcHolder.selectCredentialsForPresentationExchangeRequest(
      resolvedRequest.presentationExchange!.credentialsForRequest,
    )

    const res = await agent.modules.openId4VcHolder.acceptOpenId4VpAuthorizationRequest({
      authorizationRequestPayload: resolvedRequest.authorizationRequestPayload,
      presentationExchange: {
        credentials: selectedCredentials,
      },
    })

    expect(res.serverResponse?.status).toEqual(200)
  })
})
