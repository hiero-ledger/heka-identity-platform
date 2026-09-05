import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { ContributorOnboardingStatus } from '@/entities/User/model/types/user';
import { authEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export const getContributorOnboardingStatus = createAsyncThunk<
  ContributorOnboardingStatus,
  void,
  ThunkConfig<string>
>('contributorOnboarding/status', async (_, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.authApi.get<ContributorOnboardingStatus>(
      authEndpoints.contributorOnboardingStatus,
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
