import { StateSchema } from '@/app/providers/StoreProvider';

export const getSchema = (state: StateSchema) => state.schemas?.schema;

export const selectSchemaLoading = (state: StateSchema) =>
  state.schemas.isLoading;
