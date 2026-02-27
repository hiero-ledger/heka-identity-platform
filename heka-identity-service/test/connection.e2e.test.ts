import { Server } from 'net'

import { DidCommConnectionEventTypes, DidCommDidExchangeRole, DidCommDidExchangeState } from '@credo-ts/didcomm'
import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request, { WSChain } from 'superwstest'

import { ConnectionStateChangeDto } from 'common/notification/dto'
import { ISO_DATE_PATTERN, UUID_PATTERN } from 'src/__tests__/constants'
import {
  AcceptInvitationDto,
  ConnectionRecordDto,
  CreateInvitationRequestDto,
  CreateInvitationResponseDto,
} from 'src/connection/dto'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, signJwt, startTestApp } from './helpers'

describe('E2E connection', () => {
  let ormSchemaGenerator: SchemaGenerator

  let nestApp: INestApplication
  let app: Server

  let holderAuthToken: string
  let issuerAuthToken: string

  let holderWebSocket: WSChain
  let issuerWebSocket: WSChain

  beforeAll(async () => {
    const orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.getSchemaGenerator()
  })

  beforeEach(async () => {
    await ormSchemaGenerator.refreshDatabase()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server

    const holderId = uuid()
    const issuerId = uuid()
    const issuerOrgId = uuid()

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

    issuerAuthToken = await signJwt(
      {
        name: 'Doctor',
        type: 'access',
        roles: ['Issuer'],
        org_id: issuerOrgId,
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
    await sleep(1200)
  })

  afterEach(async () => {
    await holderWebSocket.close().expectClosed()
    await issuerWebSocket.close().expectClosed()

    // TODO: Find a way to explicitly await the required condition
    // Give AFJ event listeners some time to process pending events
    await sleep(2000)

    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clearDatabase()
  })

  test('connect', async () => {
    const issuerCreateConnectionInvitationResponse = await request(app)
      .post('/connections/create-invitation')
      .auth(issuerAuthToken, { type: 'bearer' })
      .send({
        label: 'Issuer',
        alias: 'Connection with Holder',
      } satisfies CreateInvitationRequestDto)
    expect(issuerCreateConnectionInvitationResponse.status).toBe(200)
    expect(issuerCreateConnectionInvitationResponse.body).toEqual({
      id: expect.anything(),
      invitationUrl: expect.stringMatching('^.+:.+$'),
    } satisfies CreateInvitationResponseDto)

    const invitationUrl = issuerCreateConnectionInvitationResponse.body.invitationUrl as string

    const holderAcceptConnectionInvitationResponse = await request(app)
      .post('/connections/accept-invitation')
      .auth(holderAuthToken, { type: 'bearer' })
      .send({
        invitationUrl,
        label: 'Holder',
        alias: 'Connection with Issuer',
      } satisfies AcceptInvitationDto)

    expect(holderAcceptConnectionInvitationResponse.status).toBe(200)
    expect(holderAcceptConnectionInvitationResponse.body).toEqual({
      id: expect.stringMatching(`^${UUID_PATTERN}$`),
      threadId: expect.stringMatching(`^${UUID_PATTERN}$`),
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommDidExchangeState.RequestSent,
      role: DidCommDidExchangeRole.Requester,
      did: expect.stringMatching('^did:peer:.+$'),
      theirLabel: 'Issuer',
      alias: 'Connection with Issuer',
      invitationDid: expect.stringMatching('^did:peer:.+$'),
    } satisfies ConnectionRecordDto)

    const holderConnectionRecordId = holderAcceptConnectionInvitationResponse.body.id as string
    const holderPairwiseDid = holderAcceptConnectionInvitationResponse.body.did as string
    const invitationDid = holderAcceptConnectionInvitationResponse.body.invitationDid as string
    const didExchangeThreadId = holderAcceptConnectionInvitationResponse.body.threadId as string

    await holderWebSocket.expectJson((message) => {
      expect(message).toEqual(
        expect.objectContaining({
          type: DidCommConnectionEventTypes.DidCommConnectionStateChanged,
          state: DidCommDidExchangeState.RequestSent,
          details: expect.objectContaining({
            threadId: didExchangeThreadId,
          }),
        }),
      )
    })

    let issuerConnectionRecordId: string

    await issuerWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: expect.stringMatching(`^${UUID_PATTERN}$`),
        type: DidCommConnectionEventTypes.DidCommConnectionStateChanged,
        state: DidCommDidExchangeState.RequestReceived,
        details: expect.objectContaining({
          threadId: didExchangeThreadId,
        }),
      })

      issuerConnectionRecordId = message.id as string
    })

    let issuerPairwiseDid: string

    await issuerWebSocket.expectJson((message) => {
      expect(message).toEqual(
        expect.objectContaining({
          type: DidCommConnectionEventTypes.DidCommConnectionStateChanged,
          state: DidCommDidExchangeState.ResponseSent,
          details: expect.objectContaining({
            threadId: didExchangeThreadId,
            did: expect.stringMatching('^did:peer:.+$'),
          }),
        }),
      )

      issuerPairwiseDid = message.details.did as string
    })

    await holderWebSocket.expectJson((message) => {
      expect(message).toEqual(
        expect.objectContaining({
          type: DidCommConnectionEventTypes.DidCommConnectionStateChanged,
          state: DidCommDidExchangeState.ResponseReceived,
          details: expect.objectContaining({
            threadId: didExchangeThreadId,
          }),
        }),
      )
    })

    await holderWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: holderConnectionRecordId,
        type: DidCommConnectionEventTypes.DidCommConnectionStateChanged,
        state: DidCommDidExchangeState.Completed,
        details: {
          threadId: didExchangeThreadId,
          did: holderPairwiseDid,
          theirDid: issuerPairwiseDid,
          theirLabel: 'Issuer',
          alias: 'Connection with Issuer',
          invitationDid,
        },
      } satisfies ConnectionStateChangeDto)
    })

    await issuerWebSocket.expectJson((message) => {
      expect(message).toEqual({
        id: issuerConnectionRecordId,
        type: DidCommConnectionEventTypes.DidCommConnectionStateChanged,
        state: DidCommDidExchangeState.Completed,
        details: {
          threadId: didExchangeThreadId,
          did: issuerPairwiseDid,
          theirDid: holderPairwiseDid,
          theirLabel: 'Holder',
          alias: 'Connection with Holder',
        },
      } satisfies ConnectionStateChangeDto)
    })

    const holderGetConnectionResponse = await request(app)
      .get(`/connections/${holderConnectionRecordId}`)
      .auth(holderAuthToken, { type: 'bearer' })

    expect(holderGetConnectionResponse.status).toBe(200)
    expect(holderGetConnectionResponse.body).toEqual({
      id: holderConnectionRecordId,
      threadId: didExchangeThreadId,
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommDidExchangeState.Completed,
      role: DidCommDidExchangeRole.Requester,
      did: holderPairwiseDid,
      theirDid: issuerPairwiseDid!,
      theirLabel: 'Issuer',
      alias: 'Connection with Issuer',
      invitationDid,
    } satisfies ConnectionRecordDto)

    const issuerGetConnectionResponse = await request(app)
      .get(`/connections/${issuerConnectionRecordId!}`)
      .auth(issuerAuthToken, { type: 'bearer' })

    expect(issuerGetConnectionResponse.status).toBe(200)
    expect(issuerGetConnectionResponse.body).toEqual({
      id: issuerConnectionRecordId!,
      threadId: didExchangeThreadId,
      createdAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      updatedAt: expect.stringMatching(`^${ISO_DATE_PATTERN}$`),
      state: DidCommDidExchangeState.Completed,
      role: DidCommDidExchangeRole.Responder,
      did: issuerPairwiseDid!,
      theirDid: holderPairwiseDid,
      theirLabel: 'Holder',
      alias: 'Connection with Holder',
    } satisfies ConnectionRecordDto)
  })
})
