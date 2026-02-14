import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { GetAgencyUserResult } from '@/entities/User/model/services/getAgencyUser';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export type AgencyUserFieldType = string | null | undefined | File;

export interface AgencyUserParams {
  messageDeliveryType?: string | null;
  webHook?: string | null;
  name?: string | null;
  backgroundColor?: string | null;
  registeredAt?: string | null;

  [key: string]: AgencyUserFieldType;

  logo?: File;
  resetLogo?: string; // boolean true/false
}

export interface AgencyUserProperty {
  key?: string;
  value?: AgencyUserFieldType;
}

export const patchAgencyUser = createAsyncThunk<
  GetAgencyUserResult,
  AgencyUserParams,
  ThunkConfig<string>
>('user/patch', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;
  try {
    const formData = new FormData();

    Object.keys(body).forEach((key) => {
      const value = body[key];
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });

    const response = await extra.agencyApi.patch(
      agencyEndpoints.patchUserData,
      formData,
    );
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
