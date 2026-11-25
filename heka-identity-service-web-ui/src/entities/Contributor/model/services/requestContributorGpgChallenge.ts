import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { ContributorGpgChallenge } from '../types/contributor';

export const requestContributorGpgChallenge = createAsyncThunk<
  ContributorGpgChallenge,
  void,
  ThunkConfig<string>
>('contributor/requestGpgChallenge', async (_, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.post<ContributorGpgChallenge>(
      agencyEndpoints.requestGpgChallenge,
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
