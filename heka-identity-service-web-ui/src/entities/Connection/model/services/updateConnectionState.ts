import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { ConnectionState } from '../types/connection';

export interface UpdateConnectionStateParams {
  id: string;
}

export interface UpdateConnectionStateResult {
  connectionId?: string;
  state: ConnectionState;
}

interface UpdateConnectionStateResponse {
  id: string;
  state: ConnectionState;
}

export const updateConnectionState = createAsyncThunk<
  UpdateConnectionStateResult,
  UpdateConnectionStateParams,
  ThunkConfig<string>
>('connections/state', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response =
      await extra.agencyApi.get<UpdateConnectionStateResponse | null>(
        agencyEndpoints.getConnectionState(params.id),
      );
    return {
      connectionId: response.data?.id,
      state: response.data?.state ?? ConnectionState.Start,
    };
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
