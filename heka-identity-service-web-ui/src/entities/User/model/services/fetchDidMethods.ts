import { createAsyncThunk } from '@reduxjs/toolkit';
import { AxiosInstance } from 'axios';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface FetchDidMethodsResult {
  methods: Array<string>;
}

export const fetchDidMethods = createAsyncThunk<
  FetchDidMethodsResult,
  void,
  ThunkConfig<string>
>('user/fetchDidMethods', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    return await getDidMethods(extra.agencyApi);
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});

export const getDidMethods = async (
  api: AxiosInstance,
): Promise<FetchDidMethodsResult> => {
  const response = await api.get(agencyEndpoints.getDidMethods);

  return {
    methods: response.data.methods,
  };
};
