import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { Schema } from '../types/schema';

export const createNewSchema = createAsyncThunk<
  Schema,
  FormData,
  ThunkConfig<string>
>('schema/create', async (formData, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const { data } = await extra.agencyApi.post(
      agencyEndpoints.createSchema,
      formData,
    );

    return data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
