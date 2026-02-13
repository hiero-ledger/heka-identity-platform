import { Server } from 'net'

// import { CredentialEventTypes, CredentialState } from '@credo-ts/core'
import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication, HttpStatus } from '@nestjs/common'
// import { CreateRevocationRegistryRequestDto, VerifyRevocationDto } from 'revocation/dto'
import request, { WSChain } from 'superwstest'

// import { UUID_PATTERN } from '__tests__/constants'
// import { CredentialStateChangeDto } from 'common/notification/dto'
import { CreateCredentialDefinitionDto } from 'credential-definition/dto'
import { CreateSchemaDto } from 'schema/dto'
import { uuid } from 'utils/misc'
import { sleep } from 'utils/timers'

import { initializeMikroOrm, signJwt, startTestApp } from './helpers'

describe.skip('Revocation E2E Tests', () => {
  let ormSchemaGenerator: SchemaGenerator

  let nestApp: INestApplication
  let revocationRegistryDefinitionId: string
  let revocationIndex: number
  let app: Server

  let adminAuthToken: string
  // let issuerAuthToken: string
  //let credentialDefinitionId: string
  let holderAuthToken: string
  let adminDid: string

  let adminWebSocket: WSChain
  // let issuerWebSocket: WSChain
  let holderWebSocket: WSChain

  beforeAll(async () => {
    const orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.getSchemaGenerator()
  })

  beforeEach(async () => {
    // await ormSchemaGenerator.refreshDatabase()
    //
    // nestApp = await startTestApp()
    // app = nestApp.getHttpServer() as Server
    //
    // const pharmacyId = uuid()
    // const verifierId = uuid()
    //
    // const adminId = uuid()

    await ormSchemaGenerator.refreshDatabase()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server

    const adminId = uuid()
    const holderId = uuid()

    adminAuthToken = await signJwt(
      {
        name: 'Administrator',
        type: 'access',
        roles: ['Admin'],
      },
      'test',
      {
        subject: adminId,
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    adminWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${adminAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await adminWebSocket
    // TODO: Find a way to explicitly await the required condition
    // Give NotificationGateway some time to register user and wallet
    await sleep(200)

    holderAuthToken = await signJwt(
      {
        name: 'Patient',
        type: 'access',
        roles: ['User'],
      },
      'test',
      {
        subject: holderId,
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    holderWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${holderAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await holderWebSocket
    // TODO: Find a way to explicitly await the required condition
    // Give NotificationGateway some time to register user and wallet
    await sleep(200)

    adminAuthToken = await signJwt(
      {
        name: 'Administrator',
        type: 'access',
        roles: ['Admin'],
      },
      'test',
      {
        subject: adminId,
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    const adminPostDidResponse = await request(app)
      .post('/dids')
      .send({ method: 'indy' })
      .auth(adminAuthToken, { type: 'bearer' })

    expect(adminPostDidResponse.status).toBe(201)

    adminDid = adminPostDidResponse.body.id as string

    const adminPostSchemaResponse = await request(app)
      .post('/schemas')
      .auth(adminAuthToken, { type: 'bearer' })
      .send({
        issuerId: adminDid,
        name: 'Drug Prescription',
        version: '1.0',
        attrNames: ['name', 'weight', 'customerAge'],
      } satisfies CreateSchemaDto)

    expect(adminPostSchemaResponse.status).toBe(201)

    const schemaId = adminPostSchemaResponse.body.id as string

    const issuerPostCredentialDefinitionResponse = await request(app)
      .post('/credential-definitions')
      .auth(adminAuthToken, { type: 'bearer' })
      .send({
        issuerId: adminDid,
        schemaId,
        tag: 'default',
      } satisfies CreateCredentialDefinitionDto)

    expect(issuerPostCredentialDefinitionResponse.status).toBe(201)

    //credentialDefinitionId = issuerPostCredentialDefinitionResponse.body.id as string

    // const [issuerConnectionRecordId, holderConnectionRecordId] = await connectUsers(
    //   app,
    //   {
    //     label: 'Issuer',
    //     authToken: adminAuthToken,
    //     webSocket: adminWebSocket,
    //   },
    //   {
    //     label: 'Holder',
    //     authToken: holderAuthToken,
    //     webSocket: holderWebSocket,
    //   },
    // )
    //
    // const issuerOfferCredentialResponse = await request(app)
    //   .post('/credentials/offer')
    //   .auth(adminAuthToken, { type: 'bearer' })
    //   .send({
    //     connectionId: issuerConnectionRecordId,
    //     credentialDefinitionId: credentialDefinitionId,
    //     comment: 'Prescription',
    //     attributes: [
    //       {
    //         name: 'name',
    //         value: 'Bromhexine',
    //       },
    //       {
    //         name: 'weight',
    //         value: '160',
    //       },
    //       {
    //         name: 'customerAge',
    //         value: '24',
    //       },
    //     ],
    //   } satisfies CredentialOfferDto)
    //
    // expect(issuerOfferCredentialResponse.status).toBe(200)
    //
    // const issuerCredentialRecordId = issuerOfferCredentialResponse.body.id as string
    // const issueCredentialThreadId = issuerOfferCredentialResponse.body.threadId as string
    //
    // let holderCredentialRecordId: string
    //
    // await holderWebSocket.expectJson((message) => {
    //   expect(message).toEqual({
    //     id: expect.stringMatching(`^${UUID_PATTERN}$`),
    //     type: CredentialEventTypes.CredentialStateChanged,
    //     state: CredentialState.OfferReceived,
    //     details: {
    //       connectionId: holderConnectionRecordId,
    //       threadId: issueCredentialThreadId,
    //     },
    //   } satisfies CredentialStateChangeDto)
    //
    //   holderCredentialRecordId = message.id as string
    // })
    //
    // const holderAccpetCredentialResponse = await request(app)
    //   .post(`/credentials/${holderCredentialRecordId!}/accept`)
    //   .auth(holderAuthToken, { type: 'bearer' })
    //
    // expect(holderAccpetCredentialResponse.status).toBe(200)
    //
    // const holderGetCredentialResponse = await request(app)
    //   .get(`/credentials/${holderCredentialRecordId!}`)
    //   .auth(holderAuthToken, { type: 'bearer' })
    //
    // expect(holderGetCredentialResponse.status).toBe(200)
    //
    // const issuerGetCredentialResponse = await request(app)
    //   .get(`/credentials/${issuerCredentialRecordId}`)
    //   .auth(adminAuthToken, { type: 'bearer' })
    //
    // expect(issuerGetCredentialResponse.status).toBe(200)
  })

  afterEach(async () => {
    await adminWebSocket.close().expectClosed()
    await holderWebSocket.close().expectClosed()

    // TODO: Find a way to explicitly await the required condition
    // Give AFJ event listeners some time to process pending events
    await sleep(2000)

    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clearDatabase()
  })

  // it('should create a revocation registry', async () => {
  //   const createRevocationRegistryDto: CreateRevocationRegistryRequestDto = {
  //     credentialDefinitionId: credentialDefinitionId,
  //     issuerDid: adminDid,
  //   }
  //
  //   const holderGetCredentialResponse = await request(app)
  //     .get(`/credentials/${credentialDefinitionId}`)
  //     .auth(adminAuthToken, { type: 'bearer' })
  //
  //   console.log(holderGetCredentialResponse)
  //
  //   const response = await request(app)
  //     .post('/revocation/registries')
  //     .auth(adminAuthToken, { type: 'bearer' })
  //     .send(createRevocationRegistryDto)
  //
  //   expect(response.body).toHaveProperty('revocationRegistryDefinitionId')
  // })

  // it('should revoke the credential', async () => {
  //   const revokeCredentialDto: RevokeCredentialDto = {
  //     credentialId: credentialDefinitionId,
  //   }
  //
  //   const response = await request(app)
  //     .post('/credentials/revoke')
  //     .auth(adminAuthToken, { type: 'bearer' })
  //     .send(revokeCredentialDto)
  //     .expect(HttpStatus.OK)
  //
  //   expect(response.body).toHaveProperty('success', true)
  // })

  it('should get the revocation status list and verify the credential is revoked', async () => {
    const response = await request(app)
      .get(`/revocation/status-lists/${revocationRegistryDefinitionId}`)
      // .auth(verifierAuthToken, { type: 'bearer' })
      .expect(HttpStatus.OK)

    expect(response.body).toHaveProperty('revocationRegistryId', revocationRegistryDefinitionId)
    expect(response.body).toHaveProperty('timestamp')
    expect(response.body).toHaveProperty('revocationStatusList')

    const statusList = response.body.revocationStatusList

    expect(statusList[revocationIndex]).toBe(1)
  })

  // it('should verify the credential revocation status', async () => {
  //   const verifyRevocationDto: VerifyRevocationDto = {
  //     revocationRegistryId: revocationRegistryDefinitionId,
  //     revocationIndex,
  //   }
  //
  //   const response = await request(app)
  //     .post('/revocation/verify-revocation')
  //     // .auth(verifierAuthToken, { type: 'bearer' })
  //     .send(verifyRevocationDto)
  //     .expect(HttpStatus.OK)
  //
  //   expect(response.body).toHaveProperty('revoked', true)
  // })
})
