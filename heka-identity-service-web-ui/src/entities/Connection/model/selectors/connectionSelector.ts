import { StateSchema } from '@/app/providers/StoreProvider';

export const getConnectionIsLoading = (state: StateSchema) =>
  state.connections.isLoading;

export const getConnectionInvitation = (state: StateSchema) =>
  state.connections.connectionSession?.invitationUrl;

export const getConnectionState = (state: StateSchema) =>
  state.connections.connectionSession?.state;

export const getConnectionId = (state: StateSchema) =>
  state.connections.connectionSession?.connectionId ||
  state.connections.connectionSession?.oobId;
