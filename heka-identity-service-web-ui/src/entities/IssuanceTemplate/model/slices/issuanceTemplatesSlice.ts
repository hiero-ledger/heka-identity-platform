import { PayloadAction } from '@reduxjs/toolkit';

import { createIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/createIssuanceTemplate';
import { deleteIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/deleteIssuanceTemplate';
import { buildSlice } from '@/shared/lib/store';

import { getIssuanceTemplate } from '../services/getIssuanceTemplate';
import { getIssuanceTemplateList } from '../services/getIssuanceTemplateList';
import {
  IssuanceTemplate,
  IssuanceTemplateSchema,
} from '../types/issuanceTemplate';

const initialState: IssuanceTemplateSchema = {
  isLoading: false,
  error: undefined,
  issuanceTemplates: undefined,
  issuanceTemplate: undefined,
};

export const issuanceTemplatesSlice = buildSlice({
  name: 'issuanceTemplates',
  initialState,
  reducers: {
    reset: (state) => {
      state.isLoading = initialState.isLoading;
      state.error = initialState.error;
      state.issuanceTemplates = initialState.issuanceTemplates;
      state.issuanceTemplate = initialState.issuanceTemplate;
    },
    updateIssuanceTemplate: (
      state,
      action: PayloadAction<IssuanceTemplate>,
    ) => {
      state.issuanceTemplate = action.payload;
    },
  },
  extraReducers: (builder) =>
    builder
      // List of issuance templates
      .addCase(getIssuanceTemplateList.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
        state.issuanceTemplates = undefined;
      })
      .addCase(
        getIssuanceTemplateList.fulfilled,
        (state, action: PayloadAction<IssuanceTemplate[]>) => {
          state.isLoading = false;
          state.error = undefined;
          state.issuanceTemplates = action.payload;
        },
      )
      .addCase(getIssuanceTemplateList.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
        state.issuanceTemplates = undefined;
      })
      // Single issuance template
      .addCase(getIssuanceTemplate.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(
        getIssuanceTemplate.fulfilled,
        (state, action: PayloadAction<IssuanceTemplate>) => {
          state.isLoading = false;
          state.error = undefined;
          state.issuanceTemplate = action.payload;
        },
      )
      .addCase(getIssuanceTemplate.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
        state.issuanceTemplate = undefined;
      })
      // Create issuance template
      .addCase(createIssuanceTemplate.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(
        createIssuanceTemplate.fulfilled,
        (state, action: PayloadAction<IssuanceTemplate>) => {
          state.isLoading = false;
          state.error = undefined;
          state.issuanceTemplates?.push(action.payload);
        },
      )
      .addCase(createIssuanceTemplate.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
      })
      // Delete issuance template
      .addCase(deleteIssuanceTemplate.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(deleteIssuanceTemplate.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = undefined;
        state.issuanceTemplates = state.issuanceTemplates?.filter(
          (template) => template.id != action.payload.templateId,
        );
      })
      .addCase(deleteIssuanceTemplate.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
      }),
});

export const {
  reducer: issuanceTemplatesReducer,
  actions: issuanceTemplatesActions,
  useActions: useIssuanceTemplatesActions,
} = issuanceTemplatesSlice;
