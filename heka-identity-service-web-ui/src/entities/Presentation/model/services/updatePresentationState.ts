import { createAsyncThunk } from '@reduxjs/toolkit';
import { AxiosInstance } from 'axios';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { ProtocolType } from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import {
  AnoncredsPresentationState,
  OpenIdPresentationState,
  SharedAttribute,
} from '../types/presentation';

export interface UpdatePresentationStateParams {
  protocolType: ProtocolType;
  id: string;
  useDemo?: boolean;
}

export interface CheckPresentationStateResult {
  state: OpenIdPresentationState | AnoncredsPresentationState;
  sharedAttributes?: Array<SharedAttribute>;
}

export const updatePresentationState = createAsyncThunk<
  CheckPresentationStateResult,
  UpdatePresentationStateParams,
  ThunkConfig<string>
>('presentation/state', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    switch (params.protocolType) {
      case ProtocolType.Oid4vc:
        return await updateOpenId4VcPresentationState(
          params.useDemo ? extra.agencyDemoApi : extra.agencyApi,
          params,
        );
      case ProtocolType.Aries:
        return await updateAriesPresentationState(
          params.useDemo ? extra.agencyDemoApi : extra.agencyApi,
          params,
        );
    }
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});

interface UpdateOpenIdPresentationStateResponse {
  id: string;
  state: OpenIdPresentationState;
  authorizationResponsePayload: {
    presentation_submission: {
      id: string;
      descriptor_map: Array<{
        id: string;
        format: string;
        path: string;
      }>;
    };
    vp_token: string;
  };
  sharedAttributes?: Record<string, string>;
}

const updateOpenId4VcPresentationState = async (
  api: AxiosInstance,
  params: UpdatePresentationStateParams,
): Promise<CheckPresentationStateResult> => {
  const response = await api.get<UpdateOpenIdPresentationStateResponse>(
    agencyEndpoints.updateOpenIdPresentationState(params.id),
  );

  const sharedAttributes = response.data.sharedAttributes
    ? Object.entries(response.data.sharedAttributes).map(([name, value]) => ({
        name,
        value,
      }))
    : undefined;

  return {
    state: response.data.state,
    sharedAttributes,
  };
};

interface UpdateAnoncredsPresentationStateResponse {
  revealedAttributes?: Array<{
    name: string;
    value: string;
  }>;
  state: AnoncredsPresentationState;
}

const updateAriesPresentationState = async (
  api: AxiosInstance,
  params: UpdatePresentationStateParams,
): Promise<CheckPresentationStateResult> => {
  const response = await api.get<UpdateAnoncredsPresentationStateResponse>(
    agencyEndpoints.getAnoncredsPresentationState(params.id),
  );

  return {
    state: response.data.state,
    sharedAttributes: response.data.revealedAttributes,
  };
};
