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
};

export const credentialSlice = buildSlice({
  name: 'credentials',
  initialState,
  reducers: {
    reset: (state) => {
      state.isLoading = initialState.isLoading;
      state.error = initialState.error;
      state.issuanceSession = initialState.issuanceSession;
      state.offerRequestId = undefined;
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(offerCredential.pending, (state, action) => {
        state.offerRequestId = action.meta.requestId;
        state.isLoading = true;
        state.error = undefined;
        state.issuanceSession = undefined;
      })
      .addCase(offerCredential.fulfilled, (state, action) => {
        // The flow was reset or restarted while this offer was in flight
        if (action.meta.requestId !== state.offerRequestId) return;
        const result: OfferCredentialResult = action.payload;
        state.isLoading = false;
        state.error = undefined;
        state.issuanceSession = result;
      })
      .addCase(offerCredential.rejected, (state, action) => {
        if (action.meta.requestId !== state.offerRequestId) return;
        state.error = action.payload ?? action.error.message;
        state.isLoading = false;
        state.issuanceSession = undefined;
      })
      .addCase(updateCredentialState.fulfilled, (state, action) => {
        const session = state.issuanceSession;
        // Ignore answers for an offer that has since been replaced
        if (!session || session.id !== action.meta.arg.id) return;
        const result: UpdateCredentialStateResult = action.payload;
        session.state = result.state;
      }),
});

export const {
  reducer: credentialReducer,
  actions: credentialActions,
  useActions: useCredentialActions,
} = credentialSlice;
