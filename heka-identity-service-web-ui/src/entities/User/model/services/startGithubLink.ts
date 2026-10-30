import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface GithubLinkStartResult {
  authorizationUrl: string;
}

export const startGithubLink = createAsyncThunk<
  GithubLinkStartResult,
  void,
  ThunkConfig<string>
>('contributorOnboarding/startGithubLink', async (_, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.post<GithubLinkStartResult>(
      agencyEndpoints.startGithubLink,
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
