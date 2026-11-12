import { buildSlice } from '@/shared/lib/store';

import { getDids } from '../services/getDids';
import { DidsSchema } from '../types/did';

const initialState: DidsSchema = {
  isLoading: false,
  error: undefined,
  items: undefined,
  failedMethods: undefined,
  listRequestId: undefined,
};

export const didsSlice = buildSlice({
  name: 'dids',
  initialState,
  reducers: {},
  extraReducers: (builder) =>
    builder
      // The list stays in place while it is reloaded: the details screen keeps showing its DID
      .addCase(getDids.pending, (state, action) => {
        state.listRequestId = action.meta.requestId;
        state.isLoading = true;
        state.error = undefined;
      })
      // A Retry racing a slow earlier request must not be overwritten by it
      .addCase(getDids.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.listRequestId) return;
        state.isLoading = false;
        state.error = undefined;
        state.items = action.payload.items;
        state.failedMethods = action.payload.failedMethods;
      })
      .addCase(getDids.rejected, (state, action) => {
        if (action.meta.requestId !== state.listRequestId) return;
        state.isLoading = false;
        state.error = action.payload ?? action.error.message;
        state.items = undefined;
        state.failedMethods = undefined;
      }),
});

export const { reducer: didsReducer, actions: didsActions } = didsSlice;
