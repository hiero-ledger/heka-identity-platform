import type { OpenId4VcIssuanceSessionState } from '@credo-ts/openid4vc'

import { OpenId4VcIssuanceSessionStateChangedEvent, OpenId4VcIssuerEvents } from '@credo-ts/openid4vc'

import { OpenId4VcIssuanceSessionRecordDto } from 'openid4vc/issuance-sessions/dto'

/**
 * The session as the GET routes show it. Every user of the wallet gets the notification, so it never carries the
 * transaction code. Revocation is left out: it needs a status list read.
 */
export type IssuanceSessionNotificationView = Omit<
  OpenId4VcIssuanceSessionRecordDto,
  'userPin' | 'revocable' | 'revoked'
>

export class OpenidIssueStateChangeDto {
  public type: OpenId4VcIssuerEvents
  public issuanceSession: IssuanceSessionNotificationView
  public previousState: OpenId4VcIssuanceSessionState | null

  public constructor(event: OpenId4VcIssuanceSessionStateChangedEvent) {
    const { issuanceSession, previousState } = event.payload
    const {
      revocable: _revocable,
      revoked: _revoked,
      ...session
    } = OpenId4VcIssuanceSessionRecordDto.fromOpenId4VcIssuanceSessionRecord(issuanceSession)
    this.type = event.type
    this.issuanceSession = session
    this.previousState = previousState
  }
}
