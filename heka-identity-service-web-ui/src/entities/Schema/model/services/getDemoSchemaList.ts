import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { Schema, SchemasResponse } from '../types/schema';

/** Lists the demo tenant's schemas; the slice stores them like `getSchemaList`. */
export const getDemoSchemaList = createAsyncThunk<
  Schema[],
  void,
  ThunkConfig<string>
>('schema/getDemoSchemaList', async (_, thunkAPI) => {
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
