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
  // Set when the operator chose an existing connection instead of a new invitation
  isExisting?: boolean;
}

export interface ConnectionRecord {
  id: string;
  state: ConnectionState;
  role: string;
  createdAt: string;
  theirLabel?: string;
  alias?: string;
}

export interface ConnectionSchema {
  isLoading: boolean;
  error?: string;
  connectionSession?: ConnectionSession;
  connections: ConnectionRecord[];
  isConnectionsLoading: boolean;
}
