export enum OpenIdPresentationState {
  RequestCreated = 'RequestCreated',
  RequestUriRetrieved = 'RequestUriRetrieved',
  ResponseVerified = 'ResponseVerified',
  Error = 'Error',
}

export enum AnoncredsPresentationState {
  ProposalSent = 'proposal-sent',
  ProposalReceived = 'proposal-received',
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  PresentationSent = 'presentation-sent',
  PresentationReceived = 'presentation-received',
  Declined = 'declined',
  Abandoned = 'abandoned',
  Done = 'done',
}

/**
 * Why a verification failed, as far as it can be told safely. Derived from the verifier's
 * error message, which itself is never shown: it holds internal (Credo) details.
 */
export enum PresentationFailureReason {
  Revoked = 'revoked',
  Expired = 'expired',
  Unknown = 'unknown',
}

export interface SharedAttribute {
  name: string;
  value: string;
}

export interface PresentationSession {
  id: string;
  request?: string;
  state: OpenIdPresentationState | AnoncredsPresentationState;
  sharedAttributes?: Array<SharedAttribute>;
  /** DIDComm: the verifier's verdict on the presentation; `false` means it failed verification */
  isVerified?: boolean;
  /** Set when an OpenID4VP session ends in `Error` */
  failureReason?: PresentationFailureReason;
}

export interface PresentationSchema {
  isLoading: boolean;
  error?: string;
  presentationSession?: PresentationSession;
  /** requestId of the latest requestPresentation: answers to older or reset requests are ignored */
  latestRequestId?: string;
}
