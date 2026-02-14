import { createAsyncThunk } from '@reduxjs/toolkit';
import { AxiosInstance } from 'axios';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { ProtocolType } from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { OpenIdIssuanceState } from '../types/credential';

export interface UpdateCredentialStateParams {
  protocolType: ProtocolType;
  id: string;
  useDemo?: boolean;
}

export interface UpdateCredentialStateResult {
  state: OpenIdIssuanceState;
}

export const updateCredentialState = createAsyncThunk<
  UpdateCredentialStateResult,
  UpdateCredentialStateParams,
  ThunkConfig<string>
>('credentials/state', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    switch (params.protocolType) {
      case ProtocolType.Oid4vc:
        return await updateOpenId4VcCredentialState(
          params.useDemo ? extra.agencyDemoApi : extra.agencyApi,
          params,
        );
      case ProtocolType.Aries:
        return await updateAriesCredentialState(
          params.useDemo ? extra.agencyDemoApi : extra.agencyApi,
          params,
        );
    }
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});

const updateOpenId4VcCredentialState = async (
  api: AxiosInstance,
  params: UpdateCredentialStateParams,
): Promise<UpdateCredentialStateResult> => {
  const response = await api.get(
    agencyEndpoints.updateOpenIdCredentialState(params.id),
  );
  return {
    state: response.data.state,
  };
};

const updateAriesCredentialState = async (
  api: AxiosInstance,
  params: UpdateCredentialStateParams,
): Promise<UpdateCredentialStateResult> => {
  const response = await api.get(
    agencyEndpoints.getAnoncredsCredentialState(params.id),
  );
  return {
    state: response.data.state,
  };
};
