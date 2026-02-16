import { PayloadAction } from '@reduxjs/toolkit';

import { buildSlice } from '@/shared/lib/store';

import { createNewSchema } from '../services/createSchema';
import { getSchemaList } from '../services/getSchemaList';
import { getSingleSchema } from '../services/getSingleSchema';
import { registerSchema } from '../services/registerSchema';
import { updateSchemaView } from '../services/updateSchemaView';
import { Schema, SchemasSchema } from '../types/schema';

const initialState: SchemasSchema = {
  isLoading: false,
  error: undefined,
  schemas: undefined,
  schema: undefined,
};

export const schemasSlice = buildSlice({
  name: 'schemas',
  initialState,
  reducers: {
    reset: (state) => {
      state.isLoading = initialState.isLoading;
      state.error = initialState.error;
      state.schemas = initialState.schemas;
      state.schema = initialState.schema;
    },

    updateSchema: (state, action: PayloadAction<Schema>) => {
      state.schema = action.payload;
    },
  },
  extraReducers: (builder) =>
    builder
      // List of schema
      .addCase(getSchemaList.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
        state.schemas = undefined;
      })
      .addCase(
        getSchemaList.fulfilled,
        (state, action: PayloadAction<Schema[]>) => {
          state.schemas = action.payload;
          state.isLoading = false;
          state.error = undefined;
        },
      )
      .addCase(getSchemaList.rejected, (state, payload) => {
        state.isLoading = false;
        state.schemas = undefined;
        state.error = payload.error.message;
      })
      // Single schema
      .addCase(getSingleSchema.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(
        getSingleSchema.fulfilled,
        (state, action: PayloadAction<Schema>) => {
          state.schema = action.payload;
          state.isLoading = false;
          state.error = undefined;
        },
      )
      .addCase(getSingleSchema.rejected, (state, payload) => {
        state.isLoading = false;
        state.schema = undefined;
        state.error = payload.error.message;
      })
      // Create schema
      .addCase(createNewSchema.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(createNewSchema.fulfilled, (state) => {
        state.isLoading = false;
        state.error = undefined;
      })
      .addCase(createNewSchema.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
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
          const schema = action.payload;
          state.schemas = state.schemas?.map((item) => {
            return item.id === schema.id ? schema : item;
          });
          state.schema = schema;
        },
      )
      .addCase(registerSchema.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
      })
      // Update schema
      .addCase(updateSchemaView.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(updateSchemaView.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = undefined;

        const { schemaId, params } = action.payload;
        state.schemas = state.schemas?.map((schema) => {
          return schema.id === schemaId
            ? {
                ...schema,
                logo: params.logo ?? schema.logo,
                bgColor: params.bgColor ?? schema.bgColor,
              }
            : schema;
        });
      })
      .addCase(updateSchemaView.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
      }),
});

export const {
  reducer: schemasReducer,
  actions: schemasActions,
  useActions: useSchemasActions,
} = schemasSlice;
