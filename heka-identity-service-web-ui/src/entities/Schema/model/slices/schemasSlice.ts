import { isAnyOf, PayloadAction } from '@reduxjs/toolkit';

import { buildSlice } from '@/shared/lib/store';

import { createNewSchema } from '../services/createSchema';
import { getDemoSchemaList } from '../services/getDemoSchemaList';
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
      state.listRequestId = undefined;
    },

    updateSchema: (state, action: PayloadAction<Schema>) => {
      state.schema = action.payload;
    },
  },
  extraReducers: (builder) =>
    builder
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
      .addCase(getSingleSchema.rejected, (state, action) => {
        state.isLoading = false;
        state.schema = undefined;
        state.error = action.payload ?? action.error.message;
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
          const schema = action.payload;
          state.schemas = state.schemas?.map((item) => {
            return item.id === schema.id ? schema : item;
          });
          state.schema = schema;
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
      .addCase(updateSchemaView.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? action.error.message;
      })
      // List of schemas: the tenant's and the demo tenant's share the same state
      // (matchers must follow all addCase calls)
      .addMatcher(
        isAnyOf(getSchemaList.pending, getDemoSchemaList.pending),
        (state, action) => {
          state.listRequestId = action.meta.requestId;
          state.isLoading = true;
          state.error = undefined;
          state.schemas = undefined;
        },
      )
      .addMatcher(
        isAnyOf(getSchemaList.fulfilled, getDemoSchemaList.fulfilled),
        (state, action) => {
          // A newer list request (another filter, or the demo list) has been sent since
          if (action.meta.requestId !== state.listRequestId) return;
          state.schemas = action.payload;
          state.isLoading = false;
          state.error = undefined;
        },
      )
      .addMatcher(
        isAnyOf(getSchemaList.rejected, getDemoSchemaList.rejected),
        (state, action) => {
          if (action.meta.requestId !== state.listRequestId) return;
          state.isLoading = false;
          state.schemas = undefined;
          state.error = action.payload ?? action.error.message;
        },
      ),
});

export const {
  reducer: schemasReducer,
  actions: schemasActions,
  useActions: useSchemasActions,
} = schemasSlice;
