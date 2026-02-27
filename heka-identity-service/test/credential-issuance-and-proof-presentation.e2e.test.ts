import { Server } from 'net'

import { DidCommCredentialEventTypes, DidCommCredentialState, DidCommProofEventTypes, DidCommProofState } from '@credo-ts/didcomm'
import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request, { WSChain } from 'superwstest'

import { ProofRequestFormat } from 'proof/dto/proof-request.dto'
import { DID_OID4VC_PATTERN, ISO_DATE_PATTERN, UUID_PATTERN } from 'src/__tests__/constants'
import { CredentialStateChangeDto, ProofStateChangeDto } from 'src/common/notification/dto'
import { CredentialOfferDto, CredentialRecordDto } from 'src/credential/dto'
import { CreateCredentialDefinitionDto, CredentialDefinitionDto } from 'src/credential-definition/dto'
import { PredicateType, ProofRecordDto, ProofRequestDto, ProofRevealedAttributeDto } from 'src/proof/dto'
import { CreateSchemaDto, SchemaDto } from 'src/schema/dto'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { connectUsers, initializeMikroOrm, signJwt, startTestApp } from './helpers'

// Test scenario:
//
// The director of a hospital has OrgAdmin role. He issues a public DID of the hospital and a schema of a drug prescription.
//
// A doctor working in this hospital has Issuer role.
// She issues her own public DID as a doctor working in this hospital and her own credential definition based on the hospital drug prescription schema.
//
// A patient has Holder role. He establishes connection with the doctor using the connection invitation from her.
// The doctor sends a drug prescription credential offer to the patient. The patient accepts the offer and the doctor issues the credential for him.
//
// A pharmacist working in a pharmacy has Verifier role. The patient establishes connection with the pharmacist using the connection invitation from her.
// The pharmacist requests a drug prescription proof from the patient and the patient presents the proof to her.
describe('E2E credential issuance and proof presentation', () => {
  let ormSchemaGenerator: SchemaGenerator

  let nestApp: INestApplication
  let app: Server

  let adminAuthToken: string
  let orgAdminAuthToken: string
  let issuerAuthToken: string
  let holderAuthToken: string
  let verifierAuthToken: string

  let adminWebSocket: WSChain
  let orgAdminWebSocket: WSChain
  let issuerWebSocket: WSChain
  let holderWebSocket: WSChain
  let verifierWebSocket: WSChain

  beforeAll(async () => {
    const orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.getSchemaGenerator()
  })

  beforeEach(async () => {
    await ormSchemaGenerator.refreshDatabase()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server

    const adminId = uuid() // an administrator of Heka Identity Service

    const hospitalId = uuid()
    const orgAdminId = uuid() // the director of the hospital
    const issuerId = uuid() // a doctor working in the hospital

    const holderId = uuid() // a patient

    const pharmacyId = uuid()
    const verifierId = uuid() // a pharmacist working in the pharmacy

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

    orgAdminAuthToken = await signJwt(
      {
        name: 'Director',
        type: 'access',
        roles: ['OrgAdmin'],
        org_id: hospitalId,
      },
      'test',
      {
        subject: orgAdminId,
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    orgAdminWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${orgAdminAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await orgAdminWebSocket
    // TODO: Find a way to explicitly await the required condition
    // Give NotificationGateway some time to register user and wallet
    await sleep(200)

    issuerAuthToken = await signJwt(
      {
        name: 'Doctor',
        type: 'access',
        roles: ['Issuer'],
        org_id: hospitalId,
      },
      'test',
      {
        subject: issuerId,
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    issuerWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${issuerAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await issuerWebSocket
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

    verifierAuthToken = await signJwt(
      {
        name: 'Pharmacist',
        type: 'access',
        roles: ['Verifier'],
        org_id: pharmacyId,
      },
      'test',
      {
        subject: verifierId,
        issuer: 'Heka',
        audience: 'Heka Identity Service',
        expiresIn: '1w',
      },
    )

    verifierWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${verifierAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await verifierWebSocket
    // TODO: Find a way to explicitly await the required condition
    // Give NotificationGateway some time to register user and wallet
    await sleep(200)
  })

  afterEach(async () => {
    await adminWebSocket.close().expectClosed()
    await orgAdminWebSocket.close().expectClosed()
    await issuerWebSocket.close().expectClosed()
    await holderWebSocket.close().expectClosed()
    await verifierWebSocket.close().expectClosed()

    // TODO: Find a way to explicitly await the required condition
    // Give AFJ event listeners some time to process pending events
    await sleep(2000)

    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clearDatabase()
  })

  test.skip('issue credential and present proof', async () => {
    /*** ADMIN CREATES PUBLIC DID ***/

    const adminPostDidResponse = await request(app).post('/dids').auth(adminAuthToken, { type: 'bearer' })

    expect(adminPostDidResponse.status).toBe(201)
    expect(adminPostDidResponse.body).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(`^did:key:${DID_OID4VC_PATTERN}`),
      }),
    )

    /*** ORG ADMIN CREATES PUBLIC DID ***/

    const orgAdminPostDidResponse = await request(app).post('/dids').auth(orgAdminAuthToken, { type: 'bearer' })

    expect(orgAdminPostDidResponse.status).toBe(201)
    expect(orgAdminPostDidResponse.body).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(`^did:key:${DID_OID4VC_PATTERN}$`),
      }),
    )

    const orgAdminPublicDid = orgAdminPostDidResponse.body.id as string

    /*** ORG ADMIN CREATES SCHEMA ***/

    const orgAdminPostSchemaResponse = await request(app)
      .post('/schemas')
      .auth(orgAdminAuthToken, { type: 'bearer' })
      .send({
        issuerId: orgAdminPublicDid,
        name: 'Drug Prescription',
        version: '1.0',
        attrNames: ['name', 'weight', 'customerAge'], // for simplicity we embed customerAge field in Drug Prescription schema
      } satisfies CreateSchemaDto)

    expect(orgAdminPostSchemaResponse.status).toBe(201)
    expect(orgAdminPostSchemaResponse.body).toEqual({
      id: expect.stringMatching(`^${orgAdminPublicDid}/resources/${UUID_PATTERN}$`),
      issuerId: orgAdminPublicDid,
      name: 'Drug Prescription',
      version: '1.0',
      attrNames: ['name', 'weight', 'customerAge'],
    } satisfies SchemaDto)

    const schemaId = orgAdminPostSchemaResponse.body.id as string

    /*** ISSUER CREATES PUBLIC DID ***/

    const issuerPostDidResponse = await request(app).post('/dids').auth(issuerAuthToken, { type: 'bearer' })

    expect(issuerPostDidResponse.status).toBe(201)
    expect(issuerPostDidResponse.body).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(`^did:key:${DID_OID4VC_PATTERN}$`),
      }),
    )

    const issuerPublicDid = issuerPostDidResponse.body.id as string

    /*** ISSUER CREATES CREDENTIAL DEFINITION ***/

    const issuerPostCredentialDefinitionResponse = await request(app)
      .post('/credential-definitions')
      .auth(issuerAuthToken, { type: 'bearer' })
      .send({
        issuerId: issuerPublicDid,
        schemaId,
        tag: 'default',
      } satisfies CreateCredentialDefinitionDto)

    expect(issuerPostCredentialDefinitionResponse.status).toBe(201)
    expect(issuerPostCredentialDefinitionResponse.body).toEqual({
      id: expect.stringMatching(`^${issuerPublicDid}/resources/${UUID_PATTERN}$`),
      issuerId: issuerPublicDid,
      schemaId,
      tag: 'default',
    } satisfies CredentialDefinitionDto)

    const credentialDefinitionId = issuerPostCredentialDefinitionResponse.body.id as string

    /*** HOLDER CONNECTS TO ISSUER ***/

    const [issuerConnectionRecordId, holderConnectionRecordId] = await connectUsers(
      app,
      {
        label: 'Issuer',
        authToken: issuerAuthToken,
        webSocket: issuerWebSocket,
      },
      {
        label: 'Holder',
        authToken: holderAuthToken,
        webSocket: holderWebSocket,
      },
    )

    /*** ISSUER ISSUES CREDENTIAL FOR HOLDER ***/

    const issuerOfferCredentialResponse = await request(app)
      .post('/credentials/offer')
      .auth(issuerAuthToken, { type: 'bearer' })
      .send({
        connectionId: issuerConnectionRecordId,
        credentialDefinitionId,
        comment: 'Prescription',
        attributes: [
          {
            name: 'name',
            value: 'Bromhexine',
          },
          {
            name: 'weight',
            value: '160',
          },
          {
            name: 'customerAge',
            value: '24',
          },
        ],
      } satisfies CredentialOfferDto)

    expect(issuerOfferCredentialResponse.status).toBe(200)
    expect(issuerOfferCredentialResponse.body).toEqual({
      id: expect.stringMatching(`^${UUID_PATTERN}$`),
      connectionId: issuerConnectionRecordId,
      threadId: expect.stringMatching(`^${UUID_PATTERN}$`),
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommCredentialState.OfferSent,
      credentialAttributes: [
        {
          name: 'name',
          value: 'Bromhexine',
        },
        {
          name: 'weight',
          value: '160',
        },
        {
          name: 'customerAge',
          value: '24',
        },
      ],
    } satisfies CredentialRecordDto)

    const issuerCredentialRecordId = issuerOfferCredentialResponse.body.id as string
    const issueCredentialThreadId = issuerOfferCredentialResponse.body.threadId as string

    await issuerWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: issuerCredentialRecordId,
        type: DidCommCredentialEventTypes.DidCommCredentialStateChanged,
        state: DidCommCredentialState.OfferSent,
        details: {
          connectionId: issuerConnectionRecordId,
          threadId: issueCredentialThreadId,
          credentialAttributes: [
            {
              name: 'name',
              value: 'Bromhexine',
            },
            {
              name: 'weight',
              value: '160',
            },
            {
              name: 'customerAge',
              value: '24',
            },
          ],
        },
      } satisfies CredentialStateChangeDto)
    })

    let holderCredentialRecordId: string

    await holderWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: expect.stringMatching(`^${UUID_PATTERN}$`),
        type: DidCommCredentialEventTypes.DidCommCredentialStateChanged,
        state: DidCommCredentialState.OfferReceived,
        details: {
          connectionId: holderConnectionRecordId,
          threadId: issueCredentialThreadId,
        },
      } satisfies CredentialStateChangeDto)

      holderCredentialRecordId = message.id as string
    })

    const holderAccpetCredentialResponse = await request(app)
      .post(`/credentials/${holderCredentialRecordId!}/accept`)
      .auth(holderAuthToken, { type: 'bearer' })

    expect(holderAccpetCredentialResponse.status).toBe(200)
    expect(holderAccpetCredentialResponse.body).toEqual({
      id: holderCredentialRecordId!,
      connectionId: holderConnectionRecordId,
      threadId: issueCredentialThreadId,
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommCredentialState.RequestSent,
      credentialAttributes: [
        {
          name: 'name',
          value: 'Bromhexine',
        },
        {
          name: 'weight',
          value: '160',
        },
        {
          name: 'customerAge',
          value: '24',
        },
      ],
    } satisfies CredentialRecordDto)

    await holderWebSocket.expectJson((message) => {
      expect(message).toEqual(
        expect.objectContaining({
          type: DidCommCredentialEventTypes.DidCommCredentialStateChanged,
          state: DidCommCredentialState.RequestSent,
          details: expect.objectContaining({
            threadId: issueCredentialThreadId,
          }),
        }),
      )
    })

    await issuerWebSocket.expectJson((message) => {
      expect(message).toEqual(
        expect.objectContaining({
          type: DidCommCredentialEventTypes.DidCommCredentialStateChanged,
          state: DidCommCredentialState.RequestReceived,
          details: expect.objectContaining({
            threadId: issueCredentialThreadId,
          }),
        }),
      )
    })

    await issuerWebSocket.expectJson((message) => {
      expect(message).toEqual(
        expect.objectContaining({
          type: DidCommCredentialEventTypes.DidCommCredentialStateChanged,
          state: DidCommCredentialState.CredentialIssued,
          details: expect.objectContaining({
            threadId: issueCredentialThreadId,
          }),
        }),
      )
    })

    await holderWebSocket.expectJson((message) => {
      expect(message).toEqual(
        expect.objectContaining({
          type: DidCommCredentialEventTypes.DidCommCredentialStateChanged,
          state: DidCommCredentialState.CredentialReceived,
          details: expect.objectContaining({
            threadId: issueCredentialThreadId,
          }),
        }),
      )
    })

    await holderWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: holderCredentialRecordId,
        type: DidCommCredentialEventTypes.DidCommCredentialStateChanged,
        state: DidCommCredentialState.Done,
        details: {
          connectionId: holderConnectionRecordId,
          threadId: issueCredentialThreadId,
          credentialAttributes: [
            {
              name: 'name',
              value: 'Bromhexine',
            },
            {
              name: 'weight',
              value: '160',
            },
            {
              name: 'customerAge',
              value: '24',
            },
          ],
        },
      } satisfies CredentialStateChangeDto)
    })

    await issuerWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: issuerCredentialRecordId,
        type: DidCommCredentialEventTypes.DidCommCredentialStateChanged,
        state: DidCommCredentialState.Done,
        details: {
          connectionId: issuerConnectionRecordId,
          threadId: issueCredentialThreadId,
          credentialAttributes: [
            {
              name: 'name',
              value: 'Bromhexine',
            },
            {
              name: 'weight',
              value: '160',
            },
            {
              name: 'customerAge',
              value: '24',
            },
          ],
        },
      } satisfies CredentialStateChangeDto)
    })

    const holderGetCredentialResponse = await request(app)
      .get(`/credentials/${holderCredentialRecordId!}`)
      .auth(holderAuthToken, { type: 'bearer' })

    expect(holderGetCredentialResponse.status).toBe(200)
    expect(holderGetCredentialResponse.body).toEqual({
      id: holderCredentialRecordId!,
      connectionId: holderConnectionRecordId,
      threadId: issueCredentialThreadId,
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommCredentialState.Done,
      credentialAttributes: [
        {
          name: 'name',
          value: 'Bromhexine',
        },
        {
          name: 'weight',
          value: '160',
        },
        {
          name: 'customerAge',
          value: '24',
        },
      ],
    } satisfies CredentialRecordDto)

    const issuerGetCredentialResponse = await request(app)
      .get(`/credentials/${issuerCredentialRecordId}`)
      .auth(issuerAuthToken, { type: 'bearer' })

    expect(issuerGetCredentialResponse.status).toBe(200)
    expect(issuerGetCredentialResponse.body).toEqual({
      id: issuerCredentialRecordId,
      connectionId: issuerConnectionRecordId,
      threadId: issueCredentialThreadId,
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommCredentialState.Done,
      credentialAttributes: [
        {
          name: 'name',
          value: 'Bromhexine',
        },
        {
          name: 'weight',
          value: '160',
        },
        {
          name: 'customerAge',
          value: '24',
        },
      ],
    } satisfies CredentialRecordDto)

    /*** PROVER (HOLDER) CONNECTS TO VERIFIER ***/

    const proverAuthToken = holderAuthToken
    const proverWebSocket = holderWebSocket

    const [verifierConnectionRecordId, proverConnectionRecordId] = await connectUsers(
      app,
      {
        label: 'Verifier',
        authToken: verifierAuthToken,
        webSocket: verifierWebSocket,
      },
      {
        label: 'Prover',
        authToken: proverAuthToken,
        webSocket: proverWebSocket,
      },
    )

    /*** PROVER (HOLDER) PRESENTS PROOF TO VERIFIER ***/

    const verifierRequestProofResponse = await request(app)
      .post('/proofs/request')
      .auth(verifierAuthToken, { type: 'bearer' })
      .send({
        connectionId: verifierConnectionRecordId,
        comment: 'Drug prescription proof is required for the order',
        request: {
          format: ProofRequestFormat.AnoncredsIndy,
          name: 'Prescription Proof',
          proofParams: {
            attributes: [
              {
                name: 'name',
                schemaId,
              },
              {
                name: 'weight',
                schemaId,
              },
            ],
            predicates: [
              {
                name: 'customerAge',
                type: PredicateType.GreaterThanOrEqualTo,
                value: 18,
                schemaId,
              },
            ],
          },
        },
      } satisfies ProofRequestDto)

    expect(verifierRequestProofResponse.status).toBe(200)
    expect(verifierRequestProofResponse.body).toEqual({
      id: expect.stringMatching(`^${UUID_PATTERN}$`),
      connectionId: verifierConnectionRecordId,
      threadId: expect.stringMatching(`^${UUID_PATTERN}$`),
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommProofState.RequestSent,
    } satisfies ProofRecordDto)

    const verifierProofRecordId = verifierRequestProofResponse.body.id as string
    const presentProofThreadId = verifierRequestProofResponse.body.threadId as string

    await verifierWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: verifierProofRecordId,
        type: DidCommProofEventTypes.ProofStateChanged,
        state: DidCommProofState.RequestSent,
        details: {
          connectionId: verifierConnectionRecordId,
          threadId: presentProofThreadId,
        },
      } satisfies ProofStateChangeDto)
    })

    let proverProofRecordId: string

    await proverWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: expect.stringMatching(`^${UUID_PATTERN}$`),
        type: DidCommProofEventTypes.ProofStateChanged,
        state: DidCommProofState.RequestReceived,
        details: {
          connectionId: proverConnectionRecordId,
          threadId: presentProofThreadId,
        },
      } satisfies ProofStateChangeDto)

      proverProofRecordId = message.id as string
    })

    const proverPresentProofResponse = await request(app)
      .post(`/proofs/${proverProofRecordId!}/present`)
      .auth(proverAuthToken, { type: 'bearer' })

    expect(proverPresentProofResponse.status).toBe(200)
    expect(proverPresentProofResponse.body).toEqual({
      id: proverProofRecordId!,
      connectionId: proverConnectionRecordId,
      threadId: presentProofThreadId,
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommProofState.PresentationSent,
    } satisfies ProofRecordDto)

    await proverWebSocket.expectJson((message) => {
      expect(message).toEqual(
        expect.objectContaining({
          type: DidCommProofEventTypes.ProofStateChanged,
          state: DidCommProofState.PresentationSent,
          details: expect.objectContaining({
            threadId: presentProofThreadId,
          }),
        }),
      )
    })

    await verifierWebSocket.expectJson((message) => {
      expect(message).toEqual(
        expect.objectContaining({
          type: DidCommProofEventTypes.ProofStateChanged,
          state: DidCommProofState.PresentationReceived,
          details: expect.objectContaining({
            threadId: presentProofThreadId,
          }),
        }),
      )
    })

    await verifierWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: verifierProofRecordId,
        type: DidCommProofEventTypes.ProofStateChanged,
        state: DidCommProofState.Done,
        details: {
          connectionId: verifierConnectionRecordId,
          threadId: presentProofThreadId,
          isVerified: true,
        },
      } satisfies ProofStateChangeDto)
    })

    await proverWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: proverProofRecordId,
        type: DidCommProofEventTypes.ProofStateChanged,
        state: DidCommProofState.Done,
        details: {
          connectionId: proverConnectionRecordId,
          threadId: presentProofThreadId,
        },
      } satisfies ProofStateChangeDto)
    })

    const verifierGetProofResponse = await request(app)
      .get(`/proofs/${verifierProofRecordId}`)
      .auth(verifierAuthToken, { type: 'bearer' })

    expect(verifierGetProofResponse.status).toBe(200)
    expect(verifierGetProofResponse.body).toEqual({
      id: verifierProofRecordId,
      connectionId: verifierConnectionRecordId,
      threadId: presentProofThreadId,
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommProofState.Done,
      isVerified: true,
      revealedAttributes: expect.arrayContaining([
        {
          name: 'name',
          value: 'Bromhexine',
        },
        {
          name: 'weight',
          value: '160',
        },
      ] satisfies ProofRevealedAttributeDto[]),
    } satisfies ProofRecordDto)

    const proverGetProofResponse = await request(app)
      .get(`/proofs/${proverProofRecordId!}`)
      .auth(proverAuthToken, { type: 'bearer' })

    expect(proverGetProofResponse.status).toBe(200)
    expect(proverGetProofResponse.body).toEqual({
      id: proverProofRecordId!,
      connectionId: proverConnectionRecordId,
      threadId: presentProofThreadId,
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommProofState.Done,
      revealedAttributes: expect.arrayContaining([
        {
          name: 'name',
          value: 'Bromhexine',
        },
        {
          name: 'weight',
          value: '160',
        },
      ] satisfies ProofRevealedAttributeDto[]),
    } satisfies ProofRecordDto)
  })
})
