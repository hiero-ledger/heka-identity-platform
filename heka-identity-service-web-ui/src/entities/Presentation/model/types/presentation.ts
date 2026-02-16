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

export interface SharedAttribute {
  name: string;
  value: string;
}

export interface PresentationSession {
  id: string;
  request?: string;
  state: OpenIdPresentationState | AnoncredsPresentationState;
  sharedAttributes?: Array<SharedAttribute>;
}

export interface PresentationSchema {
  isLoading: boolean;
  error?: string;
  presentationSession?: PresentationSession;
}
