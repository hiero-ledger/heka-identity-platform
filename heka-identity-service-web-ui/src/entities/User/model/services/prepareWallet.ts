import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { defaultLogoImagePath } from '@/const/image';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';
import { storeUserId } from '@/shared/api/utils/token';

export interface SetupResult {
  did: string;
}

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

    const response = await extra.agencyApi.post(
      agencyEndpoints.prepareWallet,
      params,
    );
    storeUserId(response.data.did);
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
