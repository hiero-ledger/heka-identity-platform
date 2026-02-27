import {
  DidCommConnectionDidRotatedEvent,
  DidCommConnectionStateChangedEvent,
  DidCommCredentialStateChangedEvent,
  DidCommProofStateChangedEvent,
  DidCommRevocationNotificationReceivedEvent,
} from '@credo-ts/didcomm'
import {
  OpenId4VcVerificationSessionStateChangedEvent,
  OpenId4VcIssuanceSessionStateChangedEvent,
} from '@credo-ts/openid4vc'

export type NotificationEvent =
  | DidCommConnectionDidRotatedEvent
  | DidCommConnectionStateChangedEvent
  | DidCommCredentialStateChangedEvent
  | DidCommRevocationNotificationReceivedEvent
  | DidCommProofStateChangedEvent
  | OpenId4VcIssuanceSessionStateChangedEvent
  | OpenId4VcVerificationSessionStateChangedEvent

export type NotificationEventType = NotificationEvent['type']
