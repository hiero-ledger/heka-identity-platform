import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { Schema, SchemaResponse } from '../types/schema';

export const getSingleSchema = createAsyncThunk<
  Schema,
  string,
  ThunkConfig<string>
>('schema/getSingleSchema', async (schemaId, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.get<SchemaResponse>(
      agencyEndpoints.getSingleSchema(schemaId),
    );

    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
