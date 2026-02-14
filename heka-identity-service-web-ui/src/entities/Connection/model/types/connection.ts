export enum ConnectionState {
  Start = 'start',
  InvitationSent = 'invitation-sent',
  InvitationReceived = 'invitation-received',
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  ResponseSent = 'response-sent',
  ResponseReceived = 'response-received',
  Abandoned = 'abandoned',
  Completed = 'completed',
}

export interface ConnectionSession {
  oobId: string;
  connectionId?: string;
  invitationUrl: string;
  state: ConnectionState;
}

export interface ConnectionSchema {
  isLoading: boolean;
  error?: string;
  connectionSession?: ConnectionSession;
}
