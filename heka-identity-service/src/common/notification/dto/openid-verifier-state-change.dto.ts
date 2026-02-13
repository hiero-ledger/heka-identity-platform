import {
  OpenId4VcVerificationSessionState,
  OpenId4VcVerificationSessionStateChangedEvent,
  OpenId4VcVerifierEvents,
  OpenId4VcVerificationSessionRecord,
} from '@credo-ts/openid4vc'

export class OpenidVerifierStateChangeDto {
  public type: OpenId4VcVerifierEvents
  public verificationSession: OpenId4VcVerificationSessionRecord
  public previousState: OpenId4VcVerificationSessionState | null

  public constructor(event: OpenId4VcVerificationSessionStateChangedEvent) {
    const { verificationSession, previousState } = event.payload
    this.type = event.type
    this.verificationSession = verificationSession
    this.previousState = previousState
  }
}
