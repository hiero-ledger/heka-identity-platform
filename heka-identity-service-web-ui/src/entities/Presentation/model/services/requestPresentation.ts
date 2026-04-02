import { createAsyncThunk } from '@reduxjs/toolkit';
import { AxiosInstance } from 'axios';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { demoUser } from '@/const/user';
import {
  AnoncredsPresentationState,
  OpenIdPresentationState,
} from '@/entities/Presentation/model/types/presentation';
import {
  buildAriesPresentationRequest,
  buildOpenIdPresentationRequest,
} from '@/entities/Presentation/model/utils/presentation-request';
import { Schema } from '@/entities/Schema';
import {
  AriesCredentialFormat,
  CredentialFormat,
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';
import { getUserId } from '@/shared/api/utils/token';

export interface RequestPresentationParams {
  protocolType: ProtocolType;
  credentialType: CredentialFormat;
  did?: string;
  network?: string;
  schema: Schema;
  requestedAttributes?: Array<string>;
  connectionId?: string;
  useDemo?: boolean;
  useDcApi?: boolean;
}

export interface RequestPresentationResult {
  id: string;
  request?: string;
  state: OpenIdPresentationState | AnoncredsPresentationState;
}

export const requestPresentation = createAsyncThunk<
  RequestPresentationResult,
  RequestPresentationParams,
  ThunkConfig<string>
>('presentation/request', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    switch (params.protocolType) {
      case ProtocolType.Oid4vc:
        if (params.useDcApi) {
          return await requestOpenId4VcPresentationDcApi(
            params.useDemo ? extra.agencyDemoApi : extra.agencyApi,
            params,
          );
        }
        return await requestOpenId4VcPresentation(
          params.useDemo ? extra.agencyDemoApi : extra.agencyApi,
          params,
        );
      case ProtocolType.Aries:
        return await requestAnoncredsPresentation(
          params.useDemo ? extra.agencyDemoApi : extra.agencyApi,
          params,
        );
    }
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});

interface RequestOpenIdPresentationResponse {
  authorizationRequest: string;
  verificationSession: {
    id: string;
    state: OpenIdPresentationState;
  };
}

const requestOpenId4VcPresentation = async (
  api: AxiosInstance,
  params: RequestPresentationParams,
): Promise<RequestPresentationResult> => {
  const userId = params.useDemo ? demoUser.did : getUserId();
  if (!userId) {
    throw new Error('User ID is not set');
  }

  const body = buildOpenIdPresentationRequest({
    format: params.credentialType as Openid4CredentialFormat,
    id: userId,
    did: params.did ?? userId,
    name: params.schema.name ?? params.schema.id,
    attributes:
      params.requestedAttributes ??
      params.schema.fields?.map((schema) => schema.name) ??
      [],
    doctype: params.schema.name,
    namespace: params.schema.name,
  });
  const response = await api.post<RequestOpenIdPresentationResponse>(
    agencyEndpoints.requestOpenIdPresentation,
    body,
  );

  return {
    id: response.data.verificationSession.id,
    request: response.data.authorizationRequest,
    state: response.data.verificationSession.state,
  };
};

interface RequestOpenIdPresentationDcApiResponse {
  authorizationRequest: string;
  authorizationRequestObject: Record<string, unknown>;
  verificationSession: {
    id: string;
    state: OpenIdPresentationState;
  };
}

const requestOpenId4VcPresentationDcApi = async (
  api: AxiosInstance,
  params: RequestPresentationParams,
): Promise<RequestPresentationResult> => {
  const userId = params.useDemo ? demoUser.did : getUserId();
  if (!userId) {
    throw new Error('User ID is not set');
  }

  const body = buildOpenIdPresentationRequest({
    format: params.credentialType as Openid4CredentialFormat,
    id: userId,
    did: params.did ?? userId,
    name: params.schema.name ?? params.schema.id,
    attributes:
      params.requestedAttributes ??
      params.schema.fields?.map((schema) => schema.name) ??
      [],
    doctype: params.schema.name,
    namespace: params.schema.name,
    useDcApi: true,
  });

  const response = await api.post<RequestOpenIdPresentationDcApiResponse>(
    agencyEndpoints.requestOpenIdPresentation,
    body,
  );

  const { verificationSession, authorizationRequestObject } = response.data;

  const isSigned = 'payload' in authorizationRequestObject;
  const protocol = isSigned ? 'openid4vp-v1-signed' : 'openid4vp-v1-unsigned';

  const credentialResponse = await navigator.credentials.get({
    // @ts-expect-error — DigitalCredential API not yet in lib.dom.d.ts
    digital: {
      requests: [{ protocol, data: authorizationRequestObject }],
    },
  });

  if (!credentialResponse || credentialResponse.constructor.name !== 'DigitalCredential') {
    throw new Error('Did not receive a DigitalCredential response from navigator.credentials.get()');
  }

  // @ts-expect-error — DigitalCredential.data not yet typed
  const authorizationResponse: Record<string, unknown> =
    typeof (credentialResponse as any).data === 'string'
      ? JSON.parse((credentialResponse as any).data)
      : (credentialResponse as any).data;

  await api.post(
    `${agencyEndpoints.updateOpenIdPresentationState(verificationSession.id)}/verify`,
    {
      authorizationResponse,
      origin: window.location.origin,
    },
  );

  return {
    id: verificationSession.id,
    request: undefined,
    state: OpenIdPresentationState.ResponseVerified,
  };
};

interface RequestAnoncredsPresentationResponse {
  id: string;
  state: AnoncredsPresentationState;
}

const requestAnoncredsPresentation = async (
  api: AxiosInstance,
  params: RequestPresentationParams,
): Promise<RequestPresentationResult> => {
  const body = buildAriesPresentationRequest({
    format: params.credentialType as AriesCredentialFormat,
    connectionId: params.connectionId,
    attributes:
      params.requestedAttributes ??
      params.schema.fields?.map((schema) => schema.name) ??
      [],
    schema: params.schema,
  });
  const response = await api.post<RequestAnoncredsPresentationResponse>(
    agencyEndpoints.requestAnoncredsPresentation,
    body,
  );

  return {
    id: response.data.id,
    request: undefined,
    state: response.data.state,
  };
};
