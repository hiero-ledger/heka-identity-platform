import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { ContributorBinding, Tokens } from '@/entities/User/model/types/user';
import { authEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';
import { storeTokens } from '@/shared/api/utils/token';

export interface CompleteGithubOAuthParams {
  code: string;
  state: string;
}

export interface CompleteGithubOAuthResult {
  tokens: Tokens;
  binding: ContributorBinding;
  github: {
    accountId: string;
    username: string;
  };
  redirectPath?: string;
}

export const completeGithubOAuth = createAsyncThunk<
  CompleteGithubOAuthResult,
  CompleteGithubOAuthParams,
  ThunkConfig<string>
>('contributorOnboarding/githubCallback', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.authApi.post(
      authEndpoints.githubCallback,
      body,
    );

    const tokens = {
      accessToken: response.data.access,
      refreshToken: response.data.refresh,
    };
    storeTokens(tokens);

    return {
      tokens,
      binding: response.data.binding,
      github: response.data.github,
      redirectPath: response.data.redirectPath,
    };
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
