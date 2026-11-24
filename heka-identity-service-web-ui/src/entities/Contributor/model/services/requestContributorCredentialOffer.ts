import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { ContributorCredentialOffer } from '../types/contributor';

/**
 * Creates an OID4VCI offer of the contributor credential for the signed-in user. The page shows
 * the transaction code and the expiry beside the offer (the wallet asks for the code), so an
 * answer without them is rejected like a failed request.
 */
export const requestContributorCredentialOffer = createAsyncThunk<
  ContributorCredentialOffer,
  void,
  ThunkConfig<string>
>('contributor/requestCredentialOffer', async (_, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  let offer: ContributorCredentialOffer;
  try {
    const response = await extra.agencyApi.post<ContributorCredentialOffer>(
      agencyEndpoints.contributorCredentialOffer,
    );
    offer = response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }

  if (
    !offer?.credentialOffer?.startsWith('openid-credential-offer:') ||
    !offer.txCode ||
    !offer.expiresAt
  ) {
    return handleError(
      new Error(
        'The issuer did not return a transaction code and expiry for this offer.',
      ),
      rejectWithValue,
      dispatch,
    );
  }
  return offer;
});
