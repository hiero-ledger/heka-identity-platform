import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { Schema, SchemasParams, SchemasResponse } from '../types/schema';

export const getDemoSchemaList = createAsyncThunk<
  Schema[],
  SchemasParams | undefined,
  ThunkConfig<string>
>('schema/getSchemaList', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyDemoApi.get<SchemasResponse>(
      agencyEndpoints.getSchemaList,
    );
    return response.data.items;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
