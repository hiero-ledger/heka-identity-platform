import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { UpdateSchemaParams, UpdateSchemaResult } from '../types/schema';

export const updateSchemaView = createAsyncThunk<
  UpdateSchemaResult,
  UpdateSchemaParams,
  ThunkConfig<string>
>('schema/updateSchemaView', async ({ schemaId, params }, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const { logo, bgColor } = params;
    const formData = new FormData();

    if (logo) formData.append('logo', logo);
    if (bgColor) formData.append('bgColor', bgColor);

    const { data } = await extra.agencyApi.patch(
      agencyEndpoints.updateSchema(schemaId),
      formData,
    );

    return { schemaId, params: { ...params, logo: data.logo } };
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
