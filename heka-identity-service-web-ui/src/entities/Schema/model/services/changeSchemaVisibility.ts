import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface UpdateSchemaParams {
  schemaId: string;
  params: {
    isHidden: boolean;
  };
}

export const changeSchemaVisibility = createAsyncThunk<
  void,
  UpdateSchemaParams,
  ThunkConfig<string>
>('schema/changeSchemaVisibility', async ({ schemaId, params }, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const { isHidden } = params;

    const formData = new FormData();
    formData.append('isHidden', String(isHidden));

    await extra.agencyApi.patch(
      agencyEndpoints.updateSchema(schemaId),
      formData,
    );
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
