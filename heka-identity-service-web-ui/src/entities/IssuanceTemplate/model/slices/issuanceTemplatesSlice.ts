import { createIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/createIssuanceTemplate';
import { deleteIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/deleteIssuanceTemplate';
import { buildSlice } from '@/shared/lib/store';

import { IssuanceTemplateSchema } from '../types/issuanceTemplate';

const initialState: IssuanceTemplateSchema = {
  isMutating: false,
  mutationError: undefined,
};

/**
 * Tracks the template writes only. The list and single templates are cached reads
 * (`issuanceTemplateApi`), which the write thunks invalidate.
 */
export const issuanceTemplatesSlice = buildSlice({
  name: 'issuanceTemplates',
  initialState,
  reducers: {
    reset: (state) => {
      state.isMutating = initialState.isMutating;
      state.mutationError = initialState.mutationError;
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(createIssuanceTemplate.pending, (state) => {
        state.isMutating = true;
        state.mutationError = undefined;
      })
      .addCase(createIssuanceTemplate.fulfilled, (state) => {
        state.isMutating = false;
      })
      .addCase(createIssuanceTemplate.rejected, (state, action) => {
        state.isMutating = false;
        state.mutationError = action.payload ?? action.error.message;
      })
      .addCase(deleteIssuanceTemplate.pending, (state) => {
        state.isMutating = true;
        state.mutationError = undefined;
      })
      .addCase(deleteIssuanceTemplate.fulfilled, (state) => {
        state.isMutating = false;
      })
      .addCase(deleteIssuanceTemplate.rejected, (state, action) => {
        state.isMutating = false;
        state.mutationError = action.payload ?? action.error.message;
      }),
});

export const {
  reducer: issuanceTemplatesReducer,
  actions: issuanceTemplatesActions,
  useActions: useIssuanceTemplatesActions,
} = issuanceTemplatesSlice;
