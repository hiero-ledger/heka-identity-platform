import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { ConnectionSession, ConnectionState } from '../types/connection';

export type CreateConnectionResult = ConnectionSession;

interface CreateConnectionResponse {
  id: string;
  invitationUrl: string;
}

export const createConnection = createAsyncThunk<
  CreateConnectionResult,
  void,
  ThunkConfig<string>
>('connections/create', async (_, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;
  try {
    const response = await extra.agencyApi.post<CreateConnectionResponse>(
      agencyEndpoints.createConnection,
      {
        multiUseInvitation: false,
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
