import { deleteVerificationTemplate } from '@/entities/VerificationTemplate/model/services/deleteVerificationTemplate';
import { buildSlice } from '@/shared/lib/store';

import { createVerificationTemplate } from '../services/createVerificationTemplate';
import { VerificationTemplateSchema } from '../types/verificationTemplate';

const initialState: VerificationTemplateSchema = {
  isMutating: false,
  mutationError: undefined,
};

/**
 * Tracks the template writes only. The list and single templates are cached reads
 * (`verificationTemplateApi`), which the write thunks invalidate.
 */
export const verificationTemplatesSlice = buildSlice({
  name: 'verificationTemplates',
  initialState,
  reducers: {
    reset: (state) => {
      state.isMutating = initialState.isMutating;
      state.mutationError = initialState.mutationError;
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(createVerificationTemplate.pending, (state) => {
        state.isMutating = true;
        state.mutationError = undefined;
      })
      .addCase(createVerificationTemplate.fulfilled, (state) => {
        state.isMutating = false;
      })
      .addCase(createVerificationTemplate.rejected, (state, action) => {
        state.isMutating = false;
        state.mutationError = action.payload ?? action.error.message;
      })
      .addCase(deleteVerificationTemplate.pending, (state) => {
        state.isMutating = true;
        state.mutationError = undefined;
      })
      .addCase(deleteVerificationTemplate.fulfilled, (state) => {
        state.isMutating = false;
      })
      .addCase(deleteVerificationTemplate.rejected, (state, action) => {
        state.isMutating = false;
        state.mutationError = action.payload ?? action.error.message;
      }),
});

export const {
  reducer: verificationTemplatesReducer,
  actions: verificationTemplatesActions,
  useActions: useVerificationTemplatesActions,
} = verificationTemplatesSlice;
