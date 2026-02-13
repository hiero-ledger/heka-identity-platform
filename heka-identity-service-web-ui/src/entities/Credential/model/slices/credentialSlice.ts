import { PayloadAction } from '@reduxjs/toolkit';

import { getCredentialConfig } from '@/entities/Credential/model/services/getCredentialConfig';
import { buildSlice } from '@/shared/lib/store';

import {
  offerCredential,
  OfferCredentialResult,
} from '../services/offerCredential';
import {
  updateCredentialState,
  UpdateCredentialStateResult,
} from '../services/updateCredentialState';
import { CredentialSchema } from '../types/credential';

const initialState: CredentialSchema = {
  isLoading: false,
  error: undefined,
  issuanceSession: undefined,
  credentialsConfig: undefined,
};

export const credentialSlice = buildSlice({
  name: 'credentials',
  initialState,
  reducers: {
    reset: (state) => {
      state.isLoading = initialState.isLoading;
      state.error = initialState.error;
      state.issuanceSession = initialState.issuanceSession;
      state.credentialsConfig = initialState.credentialsConfig;
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(offerCredential.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
        state.issuanceSession = undefined;
      })
      .addCase(
        offerCredential.fulfilled,
        (state, action: PayloadAction<OfferCredentialResult>) => {
          state.isLoading = false;
          state.error = undefined;
          state.issuanceSession = action.payload;
        },
      )
      .addCase(offerCredential.rejected, (state, error) => {
        state.error = error.error.message;
        state.isLoading = false;
        state.issuanceSession = undefined;
      })
      .addCase(
        updateCredentialState.fulfilled,
        (state, action: PayloadAction<UpdateCredentialStateResult>) => {
          if (state.issuanceSession) {
            state.issuanceSession.state = action.payload.state;
          }
        },
      )
      .addCase(getCredentialConfig.fulfilled, (state, action) => {
        state.credentialsConfig = action.payload;
      }),
});

export const {
  reducer: credentialReducer,
  actions: credentialActions,
  useActions: useCredentialActions,
} = credentialSlice;
