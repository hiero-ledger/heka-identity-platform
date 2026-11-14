import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { agencyApi, LIST } from '@/shared/api/rtk/agencyApi';
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
    // Right after the registration, even if the read below fails. Templates embed the
    // schema's registrations.
    dispatch(
      agencyApi.util.invalidateTags([
        { type: 'Schema', id: LIST },
        { type: 'Schema', id: schemaId },
        'IssuanceTemplate',
        'VerificationTemplate',
      ]),
    );

    // The only `GET /v2/schemas/:id` after a registration: the flow continues with it
    const response = await extra.agencyApi.get(
      agencyEndpoints.getSingleSchema(schemaId),
    );

    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
