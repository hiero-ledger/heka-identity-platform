import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface GetAgencyUserResult {
  messageDeliveryType?: string;
  webHook?: string;
  name?: string;
  backgroundColor?: string;
  logo?: string;
  registeredAt?: string;
}

export const getAgencyUser = createAsyncThunk<
  GetAgencyUserResult,
  void,
  ThunkConfig<string>
>('user/getAgencyUser', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.get<GetAgencyUserResult>(
      agencyEndpoints.getUserData,
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
