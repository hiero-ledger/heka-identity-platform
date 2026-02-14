import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { authEndpoints } from '@/shared/api/config/endpoints';
import { ApiError } from '@/shared/api/utils/error';
import { clearTokens, getRefreshToken } from '@/shared/api/utils/token';

export const signOut = createAsyncThunk<void, void, ThunkConfig<string>>(
  'oauth/signOut',
  async (_, thunkAPI) => {
    const { extra, rejectWithValue } = thunkAPI;

    const refreshToken = getRefreshToken();
    if (!refreshToken) return;

    try {
      await extra.authApi.post(authEndpoints.revoke, {
        refresh: getRefreshToken(),
      });
    } catch (error) {
      const message =
        (error as ApiError).response?.data.message ?? error.message;
      return rejectWithValue(message);
    } finally {
      clearTokens();
    }
  },
);
