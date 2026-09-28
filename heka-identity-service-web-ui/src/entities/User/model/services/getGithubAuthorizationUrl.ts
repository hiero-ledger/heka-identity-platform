import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { authEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface GithubAuthorizationUrlResult {
  authorizationUrl: string;
  state: string;
}

export const getGithubAuthorizationUrl = createAsyncThunk<
  GithubAuthorizationUrlResult,
  { redirectPath?: string } | void,
  ThunkConfig<string>
>('contributorOnboarding/githubAuthorizationUrl', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.authApi.get<GithubAuthorizationUrlResult>(
      authEndpoints.githubAuthorizationUrl,
      {
        params,
      },
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
