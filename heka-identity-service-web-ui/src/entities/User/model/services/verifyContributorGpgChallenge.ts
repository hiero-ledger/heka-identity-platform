import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { ContributorBinding } from '@/entities/User/model/types/user';
import { authEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface VerifyContributorGpgChallengeParams {
  challengeId: string;
  signature: string;
}

export interface VerifyContributorGpgChallengeResult {
  verified: boolean;
  message: string;
  gpgFingerprint?: string;
  binding?: ContributorBinding;
}

export const verifyContributorGpgChallenge = createAsyncThunk<
  VerifyContributorGpgChallengeResult,
  VerifyContributorGpgChallengeParams,
  ThunkConfig<string>
>('contributorOnboarding/verifyGpgChallenge', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.authApi.post<VerifyContributorGpgChallengeResult>(
      authEndpoints.verifyGpgChallenge,
      body,
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
