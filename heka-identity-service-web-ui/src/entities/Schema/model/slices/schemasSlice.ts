import { PayloadAction } from '@reduxjs/toolkit';

import { buildSlice } from '@/shared/lib/store';

import { createNewSchema } from '../services/createSchema';
import { registerSchema } from '../services/registerSchema';
import { updateSchemaView } from '../services/updateSchemaView';
import { Schema, SchemasSchema } from '../types/schema';

const initialState: SchemasSchema = {
  isLoading: false,
  error: undefined,
  schema: undefined,
};

/**
 * The schema selected in a flow and the state of the schema writes. The schema lists are
 * cached reads (`schemaApi`), which the write thunks invalidate.
 */
export const schemasSlice = buildSlice({
  name: 'schemas',
  initialState,
  reducers: {
    reset: (state) => {
      state.isLoading = initialState.isLoading;
      state.error = initialState.error;
      state.schema = initialState.schema;
    },

    updateSchema: (state, action: PayloadAction<Schema>) => {
      state.schema = action.payload;
    },
  },
  extraReducers: (builder) =>
    builder
      // Create schema
      .addCase(createNewSchema.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(createNewSchema.fulfilled, (state) => {
        state.isLoading = false;
        state.error = undefined;
      })
      .addCase(createNewSchema.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? action.error.message;
      })
      // Register schema
      .addCase(registerSchema.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(
        registerSchema.fulfilled,
        (state, action: PayloadAction<Schema>) => {
          state.isLoading = false;
          state.error = undefined;
          state.schema = action.payload;
        },
      )
      .addCase(registerSchema.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? action.error.message;
      })
      // Update schema
      .addCase(updateSchemaView.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(updateSchemaView.fulfilled, (state) => {
        state.isLoading = false;
        state.error = undefined;
      })
      .addCase(updateSchemaView.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? action.error.message;
      }),
});

export const {
  reducer: schemasReducer,
  actions: schemasActions,
  useActions: useSchemasActions,
} = schemasSlice;
