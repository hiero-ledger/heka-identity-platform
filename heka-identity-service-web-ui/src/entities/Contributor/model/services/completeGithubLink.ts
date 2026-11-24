import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { CompleteGithubLinkResult } from '../types/contributor';

export interface CompleteGithubLinkParams {
  code: string;
  state: string;
}

export const completeGithubLink = createAsyncThunk<
  CompleteGithubLinkResult,
  CompleteGithubLinkParams,
  ThunkConfig<string>
>('contributor/completeGithubLink', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.post<CompleteGithubLinkResult>(
      agencyEndpoints.completeGithubLink,
      body,
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
