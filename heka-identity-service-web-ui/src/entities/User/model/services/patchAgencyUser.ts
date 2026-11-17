import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { agencyApi, LIST } from '@/shared/api/rtk/agencyApi';
import { handleError } from '@/shared/api/utils/error';

import { userApi } from '../../api/userApi';
import { GetAgencyUserResult } from '../types/user';

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
  const { extra, rejectWithValue, dispatch, getState } = thunkAPI;
  const previousName =
    userApi.endpoints.getProfile.select()(getState()).data?.name;
  try {
    const formData = new FormData();

    Object.keys(body).forEach((key) => {
      const value = body[key];
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });

    const response = await extra.agencyApi.patch<GetAgencyUserResult>(
      agencyEndpoints.patchUserData,
      formData,
    );
    // The response is the whole profile: put it in the cache instead of fetching it again
    dispatch(
      userApi.util.upsertQueryData('getProfile', undefined, response.data),
    );
    // Every schema in the list carries its creator's name as `issuerName`
    if (response.data.name !== previousName) {
      dispatch(agencyApi.util.invalidateTags([{ type: 'Schema', id: LIST }]));
    }
    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
