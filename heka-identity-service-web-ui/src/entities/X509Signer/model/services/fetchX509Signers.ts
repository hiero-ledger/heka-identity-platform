import { createAsyncThunk } from '@reduxjs/toolkit';
import { AxiosInstance } from 'axios';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { X509Signer } from '@/entities/X509Signer/model/types/x509Signer';
import { agencyEndpoints } from '@/shared/api/config/endpoints';

export interface FetchX509SignersParams {
  useDemo?: boolean;
}

export interface FetchX509SignersResult {
  identities: Array<X509Signer>;
}

/**
 * List the verifier's X.509 signers to populate the DC API signer picker.
 *
 * This degrades gracefully: any failure (none provisioned, or the tenant/role can't read them)
 * rejects with `'failed'` and the picker simply falls back to the verifier DID. It deliberately does
 * NOT route through `handleError` — the picker is optional, so a missing list must not raise a toast
 * or trigger the demo sign-out side effects.
 */
export const fetchX509Signers = createAsyncThunk<
  FetchX509SignersResult,
  FetchX509SignersParams | void,
  ThunkConfig<string>
>('x509Signer/list', async (params, thunkAPI) => {
  const { extra, rejectWithValue } = thunkAPI;

  try {
    const api = params?.useDemo ? extra.agencyDemoApi : extra.agencyApi;
    return await getX509Signers(api);
  } catch {
    return rejectWithValue('failed');
  }
});

export const getX509Signers = async (
  api: AxiosInstance,
): Promise<FetchX509SignersResult> => {
  const response = await api.get<Array<X509Signer>>(
    agencyEndpoints.getX509Signers,
  );

  return { identities: response.data };
};
