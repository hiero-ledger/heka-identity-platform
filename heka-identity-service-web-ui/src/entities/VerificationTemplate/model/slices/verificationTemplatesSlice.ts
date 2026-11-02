import { PayloadAction } from '@reduxjs/toolkit';

import { deleteVerificationTemplate } from '@/entities/VerificationTemplate/model/services/deleteVerificationTemplate';
import { buildSlice } from '@/shared/lib/store';

import { createVerificationTemplate } from '../services/createVerificationTemplate';
import { getVerificationTemplate } from '../services/getVerificationTemplate';
import { getVerificationTemplateList } from '../services/getVerificationTemplateList';
import {
  VerificationTemplate,
  VerificationTemplateSchema,
} from '../types/verificationTemplate';

const initialState: VerificationTemplateSchema = {
  isLoading: false,
  error: undefined,
  isMutating: false,
  mutationError: undefined,
  verificationTemplates: undefined,
  verificationTemplate: undefined,
};

export const verificationTemplatesSlice = buildSlice({
  name: 'verificationTemplates',
  initialState,
  reducers: {
    reset: (state) => {
      state.isLoading = initialState.isLoading;
      state.error = initialState.error;
      state.isMutating = initialState.isMutating;
      state.mutationError = initialState.mutationError;
      state.verificationTemplates = initialState.verificationTemplates;
      state.verificationTemplate = initialState.verificationTemplate;
    },
    updateVerificationTemplate: (
      state,
      action: PayloadAction<VerificationTemplate>,
    ) => {
      state.verificationTemplate = action.payload;
    },
  },
  extraReducers: (builder) =>
    builder
      // List of verification templates
      .addCase(getVerificationTemplateList.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
        state.verificationTemplates = undefined;
      })
      .addCase(
        getVerificationTemplateList.fulfilled,
        (state, action: PayloadAction<VerificationTemplate[]>) => {
          state.isLoading = false;
          state.error = undefined;
          state.verificationTemplates = action.payload;
        },
      )
      .addCase(getVerificationTemplateList.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? action.error.message;
        state.verificationTemplates = undefined;
      })
      // Single verification template
      .addCase(getVerificationTemplate.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(
        getVerificationTemplate.fulfilled,
        (state, action: PayloadAction<VerificationTemplate>) => {
          state.isLoading = false;
          state.error = undefined;
          state.verificationTemplate = action.payload;
        },
      )
      .addCase(getVerificationTemplate.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? action.error.message;
        state.verificationTemplate = undefined;
      })
      // Create and delete only track the mutation: the list stays visible and keeps its own
      // loading/error state
      .addCase(createVerificationTemplate.pending, (state) => {
        state.isMutating = true;
        state.mutationError = undefined;
      })
      .addCase(
        createVerificationTemplate.fulfilled,
        (state, action: PayloadAction<VerificationTemplate>) => {
          state.isMutating = false;
          state.verificationTemplates?.push(action.payload);
        },
      )
      .addCase(createVerificationTemplate.rejected, (state, action) => {
        state.isMutating = false;
        state.mutationError = action.payload ?? action.error.message;
      })
      .addCase(deleteVerificationTemplate.pending, (state) => {
        state.isMutating = true;
        state.mutationError = undefined;
      })
      .addCase(deleteVerificationTemplate.fulfilled, (state, action) => {
        const { templateId } = action.payload;
        state.isMutating = false;
        state.verificationTemplates = state.verificationTemplates?.filter(
          (template) => template.id !== templateId,
        );
        if (state.verificationTemplate?.id === templateId) {
          state.verificationTemplate = undefined;
        }
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
