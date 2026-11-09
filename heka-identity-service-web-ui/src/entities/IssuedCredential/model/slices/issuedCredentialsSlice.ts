import { buildSlice } from '@/shared/lib/store';

import { getIssuedCredentials } from '../services/getIssuedCredentials';
import { revokeIssuedCredential } from '../services/revokeIssuedCredential';
import { IssuedCredentialsSchema } from '../types/issuedCredential';

const initialState: IssuedCredentialsSchema = {
  isLoading: false,
  error: undefined,
  items: undefined,
  revokingKey: undefined,
  listRequestId: undefined,
};

export const issuedCredentialsSlice = buildSlice({
  name: 'issuedCredentials',
  initialState,
  reducers: {},
  extraReducers: (builder) =>
    builder
      .addCase(getIssuedCredentials.pending, (state, action) => {
        state.listRequestId = action.meta.requestId;
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(getIssuedCredentials.fulfilled, (state, action) => {
        // A newer list request (e.g. Retry) has been sent since
        if (action.meta.requestId !== state.listRequestId) return;
        state.isLoading = false;
        state.items = action.payload;
      })
      .addCase(getIssuedCredentials.rejected, (state, action) => {
        if (action.meta.requestId !== state.listRequestId) return;
        state.isLoading = false;
        state.items = undefined;
        state.error = action.payload ?? action.error.message;
      })
      .addCase(revokeIssuedCredential.pending, (state, action) => {
        state.revokingKey = action.meta.arg.key;
      })
      .addCase(revokeIssuedCredential.fulfilled, (state, action) => {
        state.revokingKey = undefined;
        // Optimistic: the ledger may still report the old status for a few seconds
        const item = state.items?.find((x) => x.key === action.payload.key);
        if (item) item.revoked = true;
      })
      .addCase(revokeIssuedCredential.rejected, (state) => {
        state.revokingKey = undefined;
      }),
});

export const {
  reducer: issuedCredentialsReducer,
  actions: issuedCredentialsActions,
} = issuedCredentialsSlice;
