import { Server } from 'net'

import { ConnectionEventTypes, DidExchangeState } from '@credo-ts/didcomm'
import request, { WSChain } from 'superwstest'

import { AcceptInvitationDto, CreateInvitationRequestDto, CreateInvitationResponseDto } from 'src/connection/dto'

export interface UserControl {
  label: string
  authToken: string
  webSocket: WSChain
}

export async function connectUsers(app: Server, inviter: UserControl, invitee: UserControl): Promise<[string, string]> {
  const inviterCreateConnectionInvitationResponse = await request(app)
    .post('/connections/create-invitation')
    .auth(inviter.authToken, { type: 'bearer' })
    .send({
      label: inviter.label,
      alias: `Connection with ${invitee.label}`,
    } satisfies CreateInvitationRequestDto)

  expect(inviterCreateConnectionInvitationResponse.status).toBe(200)
  expect(inviterCreateConnectionInvitationResponse.body).toEqual({
    id: expect.anything(),
    invitationUrl: expect.anything(),
  } satisfies CreateInvitationResponseDto)

  const invitationUrl = inviterCreateConnectionInvitationResponse.body.invitationUrl as string

  const inviteeAcceptConnectionInvitationResponse = await request(app)
    .post('/connections/accept-invitation')
    .auth(invitee.authToken, { type: 'bearer' })
    .send({
      invitationUrl,
      label: invitee.label,
      alias: `Connection with ${inviter.label}`,
    } satisfies AcceptInvitationDto)

  expect(inviteeAcceptConnectionInvitationResponse.status).toBe(200)
  expect(inviteeAcceptConnectionInvitationResponse.body).toEqual(
    expect.objectContaining({
      id: expect.anything(),
      threadId: expect.anything(),
    }),
  )

  const inviteeConnectionRecordId = inviteeAcceptConnectionInvitationResponse.body.id as string
  const didExchangeThreadId = inviteeAcceptConnectionInvitationResponse.body.threadId as string

  await invitee.webSocket.expectJson((message) => {
    expect(message).toEqual(
      expect.objectContaining({
        type: ConnectionEventTypes.ConnectionStateChanged,
        state: DidExchangeState.RequestSent,
        details: expect.objectContaining({
          threadId: didExchangeThreadId,
        }),
      }),
    )
  })

  let inviterConnectionRecordId: string

  await inviter.webSocket.expectJson((message) => {
    expect(message).toEqual({
      id: expect.anything(),
      type: ConnectionEventTypes.ConnectionStateChanged,
      state: DidExchangeState.RequestReceived,
      details: expect.objectContaining({
        threadId: didExchangeThreadId,
      }),
    })

    inviterConnectionRecordId = message.id as string
  })

  await inviter.webSocket.expectJson((message) => {
    expect(message).toEqual(
      expect.objectContaining({
        type: ConnectionEventTypes.ConnectionStateChanged,
        state: DidExchangeState.ResponseSent,
        details: expect.objectContaining({
          threadId: didExchangeThreadId,
        }),
      }),
    )
  })

  await invitee.webSocket.expectJson((message) => {
    expect(message).toEqual(
      expect.objectContaining({
        type: ConnectionEventTypes.ConnectionStateChanged,
        state: DidExchangeState.ResponseReceived,
        details: expect.objectContaining({
          threadId: didExchangeThreadId,
        }),
      }),
    )
  })

  await invitee.webSocket.expectJson((message) => {
    expect(message).toEqual(
      expect.objectContaining({
        type: ConnectionEventTypes.ConnectionStateChanged,
        state: DidExchangeState.Completed,
        details: expect.objectContaining({
          threadId: didExchangeThreadId,
        }),
      }),
    )
  })

  await inviter.webSocket.expectJson((message) => {
    expect(message).toEqual(
      expect.objectContaining({
        type: ConnectionEventTypes.ConnectionStateChanged,
        state: DidExchangeState.Completed,
        details: expect.objectContaining({
          threadId: didExchangeThreadId,
        }),
      }),
    )
  })

  return [inviterConnectionRecordId!, inviteeConnectionRecordId]
}
