import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { ContributorOnboardingStatus } from '../types/contributor';

export const getContributorOnboardingStatus = createAsyncThunk<
  ContributorOnboardingStatus,
  void,
  ThunkConfig<string>
>('contributor/status', async (_, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.get<ContributorOnboardingStatus>(
      agencyEndpoints.contributorOnboardingStatus,
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
