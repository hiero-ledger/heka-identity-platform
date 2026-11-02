import { PayloadAction } from '@reduxjs/toolkit';

import { buildSlice } from '@/shared/lib/store';

import {
  createConnection,
  CreateConnectionResult,
} from '../services/createConnection';
import { fetchConnections } from '../services/fetchConnections';
import {
  updateConnectionState,
  UpdateConnectionStateResult,
} from '../services/updateConnectionState';
import {
  ConnectionRecord,
  ConnectionSchema,
  ConnectionSession,
  ConnectionState,
} from '../types/connection';

const initialState: ConnectionSchema = {
  isLoading: false,
  error: undefined,
  connectionSession: undefined,
  connections: [],
  isConnectionsLoading: false,
};

// Once the operator picked an existing connection, a late invitation response must not replace it
const isExistingConnectionChosen = (session?: ConnectionSession) =>
  !!session?.isExisting;

export const connectionSlice = buildSlice({
  name: 'connections',
  initialState,
  reducers: {
    reset: (state) => {
      state.isLoading = initialState.isLoading;
      state.error = initialState.error;
      state.connectionSession = initialState.connectionSession;
      state.connections = initialState.connections;
      state.isConnectionsLoading = initialState.isConnectionsLoading;
    },
    selectExistingConnection: (state, action: PayloadAction<string>) => {
      state.isLoading = false;
      state.connectionSession = {
        oobId: '',
        connectionId: action.payload,
        invitationUrl: '',
        state: ConnectionState.Completed,
        isExisting: true,
      };
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(createConnection.pending, (state) => {
        if (isExistingConnectionChosen(state.connectionSession)) return;
        state.isLoading = true;
        state.error = undefined;
        state.connectionSession = undefined;
      })
      .addCase(
        createConnection.fulfilled,
        (state, action: PayloadAction<CreateConnectionResult>) => {
          if (isExistingConnectionChosen(state.connectionSession)) return;
          state.isLoading = false;
          state.error = undefined;
          state.connectionSession = action.payload;
        },
      )
      .addCase(createConnection.rejected, (state, action) => {
        if (isExistingConnectionChosen(state.connectionSession)) return;
        state.error = action.payload ?? action.error.message;
        state.isLoading = false;
        state.connectionSession = undefined;
      })
      .addCase(updateConnectionState.fulfilled, (state, action) => {
        const session = state.connectionSession;
        const polledId = action.meta.arg.id;
        // Ignore answers for an invitation that has since been replaced
        if (
          !session ||
          (polledId !== session.oobId && polledId !== session.connectionId)
        ) {
          return;
        }
        const result: UpdateConnectionStateResult = action.payload;
        session.connectionId = result.connectionId;
        session.state = result.state;
      })
      .addCase(fetchConnections.pending, (state) => {
        state.isConnectionsLoading = true;
      })
      .addCase(
        fetchConnections.fulfilled,
        (state, action: PayloadAction<ConnectionRecord[]>) => {
          state.isConnectionsLoading = false;
          state.connections = action.payload;
        },
      )
      .addCase(fetchConnections.rejected, (state) => {
        state.isConnectionsLoading = false;
        state.connections = [];
      }),
});

export const {
  reducer: connectionReducer,
  actions: connectionActions,
  useActions: useConnectionActions,
} = connectionSlice;
