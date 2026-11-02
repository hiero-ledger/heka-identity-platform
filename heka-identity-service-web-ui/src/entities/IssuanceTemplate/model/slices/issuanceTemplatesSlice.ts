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
  isMutating: false,
  mutationError: undefined,
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
      state.isMutating = initialState.isMutating;
      state.mutationError = initialState.mutationError;
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
      .addCase(getIssuanceTemplateList.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? action.error.message;
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
      .addCase(getIssuanceTemplate.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? action.error.message;
        state.issuanceTemplate = undefined;
      })
      // Create and delete only track the mutation: the list stays visible and keeps its own
      // loading/error state
      .addCase(createIssuanceTemplate.pending, (state) => {
        state.isMutating = true;
        state.mutationError = undefined;
      })
      .addCase(
        createIssuanceTemplate.fulfilled,
        (state, action: PayloadAction<IssuanceTemplate>) => {
          state.isMutating = false;
          state.issuanceTemplates?.push(action.payload);
        },
      )
      .addCase(createIssuanceTemplate.rejected, (state, action) => {
        state.isMutating = false;
        state.mutationError = action.payload ?? action.error.message;
      })
      .addCase(deleteIssuanceTemplate.pending, (state) => {
        state.isMutating = true;
        state.mutationError = undefined;
      })
      .addCase(deleteIssuanceTemplate.fulfilled, (state, action) => {
        const { templateId } = action.payload;
        state.isMutating = false;
        state.issuanceTemplates = state.issuanceTemplates?.filter(
          (template) => template.id !== templateId,
        );
        if (state.issuanceTemplate?.id === templateId) {
          state.issuanceTemplate = undefined;
        }
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
