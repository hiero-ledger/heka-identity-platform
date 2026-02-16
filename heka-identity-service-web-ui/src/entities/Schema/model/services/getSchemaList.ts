import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { Schema, SchemasParams, SchemasResponse } from '../types/schema';

export const getSchemaList = createAsyncThunk<
  Schema[],
  SchemasParams | undefined,
  ThunkConfig<string>
>('schema/getSchemaList', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.get<SchemasResponse>(
      agencyEndpoints.getSchemaList,
      {
        params,
      },
    );

    return response.data.items;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
