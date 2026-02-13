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
      .addCase(getVerificationTemplateList.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
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
      .addCase(getVerificationTemplate.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
        state.verificationTemplate = undefined;
      })
      // Create verification template
      .addCase(createVerificationTemplate.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(
        createVerificationTemplate.fulfilled,
        (state, action: PayloadAction<VerificationTemplate>) => {
          state.isLoading = false;
          state.error = undefined;
          state.verificationTemplates?.push(action.payload);
        },
      )
      .addCase(createVerificationTemplate.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
      })
      // Delete verification template
      .addCase(deleteVerificationTemplate.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(deleteVerificationTemplate.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = undefined;
        state.verificationTemplates = state.verificationTemplates?.filter(
          (template) => template.id != action.payload.templateId,
        );
      })
      .addCase(deleteVerificationTemplate.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
      }),
});

export const {
  reducer: verificationTemplatesReducer,
  actions: verificationTemplatesActions,
  useActions: useVerificationTemplatesActions,
} = verificationTemplatesSlice;
