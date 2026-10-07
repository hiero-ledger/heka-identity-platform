import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { ConnectionRecord, ConnectionState } from '../types/connection';

export interface FetchConnectionsParams {
  useDemo?: boolean;
}

export const fetchConnections = createAsyncThunk<
  ConnectionRecord[],
  FetchConnectionsParams,
  ThunkConfig<string>
>('connections/list', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;
  // Connections belong to a tenant, so read them from the tenant the offer goes to
  const api = params.useDemo ? extra.agencyDemoApi : extra.agencyApi;

  try {
    const response = await api.get<ConnectionRecord[]>(
      agencyEndpoints.getConnections,
    );
    return (response.data ?? [])
      .filter((connection) => connection.state === ConnectionState.Completed)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
