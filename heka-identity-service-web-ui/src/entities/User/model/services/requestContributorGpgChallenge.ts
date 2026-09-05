import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { authEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface ContributorGpgChallenge {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  githubUsername: string;
  githubAccountId: string;
}

export const requestContributorGpgChallenge = createAsyncThunk<
  ContributorGpgChallenge,
  void,
  ThunkConfig<string>
>('contributorOnboarding/requestGpgChallenge', async (_, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.authApi.post<ContributorGpgChallenge>(
      authEndpoints.requestGpgChallenge,
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
