import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { ContributorCredentialOfferState } from '../types/contributor';

/** Reads the state of the signed-in user's contributor credential offer */
export const getContributorCredentialOfferState = createAsyncThunk<
  ContributorCredentialOfferState,
  string,
  ThunkConfig<string>
>('contributor/credentialOfferState', async (issuanceSessionId, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.get<ContributorCredentialOfferState>(
      agencyEndpoints.contributorCredentialOfferState(issuanceSessionId),
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
