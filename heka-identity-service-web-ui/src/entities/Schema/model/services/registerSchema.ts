import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { Schema, SchemaRegistration } from '../types/schema';

export const registerSchema = createAsyncThunk<
  Schema,
  SchemaRegistration,
  ThunkConfig<string>
>('schema/register', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;
  const { schemaId, ...data } = body;

  try {
    await extra.agencyApi.post(agencyEndpoints.registerSchema(schemaId), data);

    const response = await extra.agencyApi.get(
      agencyEndpoints.getSingleSchema(schemaId),
    );

    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
