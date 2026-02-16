import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { authEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';
import { storeTokens } from '@/shared/api/utils/token';

import { Tokens } from '../types/user';

export interface SignInParams {
  name: string;
  password: string;
}

export const signIn = createAsyncThunk<
  Tokens,
  SignInParams,
  ThunkConfig<string>
>('oauth/token', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.authApi.post(authEndpoints.token, body);

    const tokens = {
      accessToken: response.data.access,
      refreshToken: response.data.refresh,
    };
    storeTokens(tokens);

    return tokens;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
