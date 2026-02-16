import { createAsyncThunk } from '@reduxjs/toolkit';
import { AxiosInstance } from 'axios';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { DidDocument } from '@/entities/User/model/types/user';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface GetDidDocumentsParams {
  method?: string;
}

export interface GetDidDocumentsResult {
  didDocuments: Array<DidDocument>;
}

export const fetchDidDocuments = createAsyncThunk<
  GetDidDocumentsResult,
  GetDidDocumentsParams,
  ThunkConfig<string>
>('user/fetchDidDocuments', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    return await getDidDocuments(extra.agencyApi, body);
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});

export const getDidDocuments = async (
  api: AxiosInstance,
  params: GetDidDocumentsParams,
): Promise<GetDidDocumentsResult> => {
  const response = await api.get<Array<DidDocument>>(agencyEndpoints.getDids, {
    params: {
      own: true,
      method: params.method,
    },
  });

  return {
    didDocuments: response.data,
  };
};
