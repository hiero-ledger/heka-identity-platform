import {
  ConnectionDidRotatedEvent,
  ConnectionStateChangedEvent,
  CredentialStateChangedEvent,
  ProofStateChangedEvent,
  RevocationNotificationReceivedEvent,
} from '@credo-ts/didcomm'
import {
  OpenId4VcVerificationSessionStateChangedEvent,
  OpenId4VcIssuanceSessionStateChangedEvent,
} from '@credo-ts/openid4vc'

export type NotificationEvent =
  | ConnectionDidRotatedEvent
  | ConnectionStateChangedEvent
  | CredentialStateChangedEvent
  | RevocationNotificationReceivedEvent
  | ProofStateChangedEvent
  | OpenId4VcIssuanceSessionStateChangedEvent
  | OpenId4VcVerificationSessionStateChangedEvent

export type NotificationEventType = NotificationEvent['type']
