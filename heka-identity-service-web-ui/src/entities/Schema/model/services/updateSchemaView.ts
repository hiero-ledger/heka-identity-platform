import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { agencyApi, LIST } from '@/shared/api/rtk/agencyApi';
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
    // Templates embed the schema's logo and colour
    dispatch(
      agencyApi.util.invalidateTags([
        { type: 'Schema', id: LIST },
        { type: 'Schema', id: schemaId },
        'IssuanceTemplate',
        'VerificationTemplate',
      ]),
    );

    return { schemaId, params: { ...params, logo: data.logo } };
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
