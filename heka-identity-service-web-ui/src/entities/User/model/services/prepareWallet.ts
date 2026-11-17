import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { defaultLogoImagePath } from '@/const/image';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { agencyApi, LIST } from '@/shared/api/rtk/agencyApi';
import { handleError } from '@/shared/api/utils/error';
import { storeUserId } from '@/shared/api/utils/token';

/** Outcome for one DID method (`PreparedDidDto` of the identity service) */
export interface PreparedDid {
  method: string;
  did?: string;
  /** `skipped`: the method is not allowed for the caller's role */
  status: 'created' | 'existing' | 'failed' | 'skipped';
  error?: string;
}

export interface SetupResult {
  did: string;
  dids: PreparedDid[];
}

/** No DID is left `failed`: the next call would change nothing */
export const isWalletFullyPrepared = (result: SetupResult) =>
  !(result.dids ?? []).some((did) => did.status === 'failed');

export const prepareWallet = createAsyncThunk<
  SetupResult,
  void,
  ThunkConfig<string>
>('user/prepareWallet', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;
  try {
    const userLogoBlob = await fetch(defaultLogoImagePath).then((r) =>
      r.blob(),
    );

    const params = new FormData();
    params.append('userLogo', userLogoBlob, 'user-logo.png');

    const response = await extra.agencyApi.post<SetupResult>(
      agencyEndpoints.prepareWallet,
      params,
    );
    storeUserId(response.data.did);

    // A created DID means a first (or repaired) preparation, which also patches the profile.
    // The Web UI sends no schemas, so the schema lists never change here.
    if ((response.data.dids ?? []).some((did) => did.status === 'created')) {
      dispatch(
        agencyApi.util.invalidateTags(['Profile', { type: 'Did', id: LIST }]),
      );
    }
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
