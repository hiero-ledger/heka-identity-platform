import type { OpenId4VcIssuanceSessionState } from '@credo-ts/openid4vc'
import type { OpenId4VcIssuanceSessionRecord } from '@credo-ts/openid4vc/build/openid4vc-issuer/repository'

import { OpenId4VcIssuanceSessionStateChangedEvent, OpenId4VcIssuerEvents } from '@credo-ts/openid4vc'

export class OpenidIssueStateChangeDto {
  public type: OpenId4VcIssuerEvents
  public issuanceSession: OpenId4VcIssuanceSessionRecord
  public previousState: OpenId4VcIssuanceSessionState | null

  public constructor(event: OpenId4VcIssuanceSessionStateChangedEvent) {
    const { issuanceSession, previousState } = event.payload
    this.type = event.type
    this.issuanceSession = issuanceSession
    this.previousState = previousState
  }
}
