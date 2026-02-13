import { StateSchema } from '@/app/providers/StoreProvider';

export const getSchemas = (state: StateSchema) => state.schemas?.schemas;

export const getSchema = (state: StateSchema) => state.schemas?.schema;

export const selectSchemaLoading = (state: StateSchema) =>
  state.schemas.isLoading;
