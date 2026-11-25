import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { VerifyContributorGpgChallengeResult } from '../types/contributor';

export interface VerifyContributorGpgChallengeParams {
  challengeId: string;
  signature: string;
}

export const verifyContributorGpgChallenge = createAsyncThunk<
  VerifyContributorGpgChallengeResult,
  VerifyContributorGpgChallengeParams,
  ThunkConfig<string>
>('contributor/verifyGpgChallenge', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response =
      await extra.agencyApi.post<VerifyContributorGpgChallengeResult>(
        agencyEndpoints.verifyGpgChallenge,
        body,
      );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
