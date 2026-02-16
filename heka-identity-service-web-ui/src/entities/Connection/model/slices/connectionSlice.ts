import { PayloadAction } from '@reduxjs/toolkit';

import { buildSlice } from '@/shared/lib/store';

import {
  createConnection,
  CreateConnectionResult,
} from '../services/createConnection';
import {
  updateConnectionState,
  UpdateConnectionStateResult,
} from '../services/updateConnectionState';
import { ConnectionSchema } from '../types/connection';

const initialState: ConnectionSchema = {
  isLoading: false,
  error: undefined,
  connectionSession: undefined,
};

export const connectionSlice = buildSlice({
  name: 'connections',
  initialState,
  reducers: {
    reset: (state) => {
      state.isLoading = initialState.isLoading;
      state.error = initialState.error;
      state.connectionSession = initialState.connectionSession;
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(createConnection.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
        state.connectionSession = undefined;
      })
      .addCase(
        createConnection.fulfilled,
        (state, action: PayloadAction<CreateConnectionResult>) => {
          state.isLoading = false;
          state.error = undefined;
          state.connectionSession = action.payload;
        },
      )
      .addCase(createConnection.rejected, (state, error) => {
        state.error = error.error.message;
        state.isLoading = false;
        state.connectionSession = undefined;
      })
      .addCase(
        updateConnectionState.fulfilled,
        (state, action: PayloadAction<UpdateConnectionStateResult>) => {
          if (state.connectionSession) {
            state.connectionSession.connectionId = action.payload.connectionId;
            state.connectionSession.state = action.payload.state;
          }
        },
      ),
});

export const {
  reducer: connectionReducer,
  actions: connectionActions,
  useActions: useConnectionActions,
} = connectionSlice;
