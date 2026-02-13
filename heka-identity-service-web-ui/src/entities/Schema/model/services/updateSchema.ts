import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { UpdateSchemaParams } from '../types/schema';

export const updateSchema = createAsyncThunk<
  void,
  UpdateSchemaParams,
  ThunkConfig<string>
>('schema/updateSchema', async ({ schemaId, params }, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const { prevSchemaId, isHidden } = params;

    const formData = new FormData();

    if (prevSchemaId || prevSchemaId === null)
      formData.append('previousSchemaId', String(prevSchemaId));
    if (isHidden !== undefined) formData.append('isHidden', String(isHidden));

    await extra.agencyApi.patch(
      agencyEndpoints.updateSchema(schemaId),
      formData,
    );
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
