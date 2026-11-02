import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { ConnectionSession, ConnectionState } from '../types/connection';

export interface CreateConnectionParams {
  useDemo?: boolean;
  // Operator-chosen name, stored on the connection once the wallet connects
  alias?: string;
}

export type CreateConnectionResult = ConnectionSession;

interface CreateConnectionResponse {
  id: string;
  invitationUrl: string;
}

export const createConnection = createAsyncThunk<
  CreateConnectionResult,
  CreateConnectionParams,
  ThunkConfig<string>
>('connections/create', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;
  const api = params.useDemo ? extra.agencyDemoApi : extra.agencyApi;
  const alias = params.alias?.trim();

  try {
    const response = await api.post<CreateConnectionResponse>(
      agencyEndpoints.createConnection,
      {
        multiUseInvitation: false,
        ...(alias ? { alias } : {}),
      },
    );
    return {
      oobId: response.data.id,
      invitationUrl: response.data.invitationUrl,
      state: ConnectionState.Start,
    };
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
