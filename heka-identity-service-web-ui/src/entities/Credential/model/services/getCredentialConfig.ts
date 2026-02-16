import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export class CredentialConfig {
  [key: string]: {
    credentials: string[];
    networks: string[];
  };
}

export const getCredentialConfig = createAsyncThunk<
  CredentialConfig,
  void,
  ThunkConfig<string>
>('credentials/config', async (_body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;
  try {
    const response = await extra.agencyApi.get(
      agencyEndpoints.getCredentialConfig,
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
