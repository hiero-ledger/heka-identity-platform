import { createAsyncThunk } from '@reduxjs/toolkit';
import { AxiosInstance } from 'axios';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { demoUser } from '@/const/user';
import {
  AnoncredsPresentationState,
  OpenIdPresentationState,
  SharedAttribute,
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
import { DcApiProtocolIdentifier } from '@/shared/lib/dcApi';

export type DcApiErrorCode = 'cancelled' | 'unsupported' | 'failed';

export class DcApiError extends Error {
  public readonly code: DcApiErrorCode;

  constructor(code: DcApiErrorCode) {
    super(`dc-api:${code}`);
    this.name = 'DcApiError';
    this.code = code;
  }
}

const toDcApiError = (error: unknown): DcApiError => {
  const name = error instanceof Error ? error.name : '';
  // Picker dismissed, no credential chosen, or the request was aborted (our Cancel button, page
  // navigation, or the OS cross-device timeout).
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return new DcApiError('cancelled');
  }
  // The browser/platform cannot service the request: the protocol/interface is unavailable
  // (`NotSupportedError`) or it was blocked by policy / an insecure context (`SecurityError`).
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    return new DcApiError('unsupported');
  }
  return new DcApiError('failed');
};

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
  sharedAttributes?: Array<SharedAttribute>;
}

export const requestPresentation = createAsyncThunk<
  RequestPresentationResult,
  RequestPresentationParams,
  ThunkConfig<string>
>('presentation/request', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch, signal } = thunkAPI;

  try {
    switch (params.protocolType) {
      case ProtocolType.Oid4vc:
        if (params.useDcApi) {
          return await requestOpenId4VcPresentationDcApi(
            params.useDemo ? extra.agencyDemoApi : extra.agencyApi,
            params,
            signal,
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
    // DC API picker/transport errors are classified to a stable code and surfaced inline by the
    // UI, skipping the generic toast + demo sign-out side effects of handleError.
    if (error instanceof DcApiError) {
      return rejectWithValue(error.code);
    }
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
  signal?: AbortSignal,
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
    // Bind the calling page into the signed request so the holder accepts it.
    expectedOrigins: [window.location.origin],
  });

  const response = await api.post<RequestOpenIdPresentationDcApiResponse>(
    agencyEndpoints.requestOpenIdPresentation,
    body,
  );

  const { verificationSession, authorizationRequestObject } = response.data;

  const isSigned = 'payload' in authorizationRequestObject;
  const protocolIdentifier = isSigned
    ? DcApiProtocolIdentifier.OpenId4VpV1Signed
    : DcApiProtocolIdentifier.OpenId4VpV1Unsigned;

  let credentialResponse: Credential | null;
  try {
    credentialResponse = await navigator.credentials.get({
      // @ts-expect-error — DigitalCredential API not yet in lib.dom.d.ts
      digital: {
        requests: [
          {
            protocol: protocolIdentifier,
            data: authorizationRequestObject,
          },
        ],
      },
      signal,
    });
  } catch (error) {
    throw toDcApiError(error);
  }

  if (
    !credentialResponse ||
    credentialResponse.constructor.name !== 'DigitalCredential'
  ) {
    throw new DcApiError('failed');
  }

  // DigitalCredential.data is not yet typed in lib.dom.d.ts
  const data = (
    credentialResponse as unknown as { data: string | Record<string, unknown> }
  ).data;
  const authorizationResponse: Record<string, unknown> =
    typeof data === 'string' ? JSON.parse(data) : data;

  const verifyResponse = await api.post<{
    sharedAttributes?: Record<string, unknown>;
  }>(
    `${agencyEndpoints.updateOpenIdPresentationState(verificationSession.id)}/verify`,
    {
      authorizationResponse,
      origin: window.location.origin,
    },
  );

  const sharedAttributes = verifyResponse.data.sharedAttributes
    ? Object.entries(verifyResponse.data.sharedAttributes).map(
        ([name, value]) => ({ name, value: String(value) }),
      )
    : undefined;

  return {
    id: verificationSession.id,
    request: undefined,
    state: OpenIdPresentationState.ResponseVerified,
    sharedAttributes,
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
