import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { userRole } from '@/const/user';
import { authEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface SignUpParams {
  name: string;
  password: string;
}

export const signUp = createAsyncThunk<void, SignUpParams, ThunkConfig<string>>(
  'user/register',
  async (body, thunkAPI) => {
    const { extra, rejectWithValue, dispatch } = thunkAPI;

    try {
      await extra.authApi.post(authEndpoints.register, {
        ...body,
        role: userRole,
      });
    } catch (error) {
      return handleError(error, rejectWithValue, dispatch);
    }
  },
);
