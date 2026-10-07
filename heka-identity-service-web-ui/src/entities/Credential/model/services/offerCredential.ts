import { createAsyncThunk } from '@reduxjs/toolkit';
import { AxiosInstance } from 'axios';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import {
  buildCredential,
  buildOpenIdCredentialOffer,
} from '@/entities/Credential/model/utils/credential';
import { Schema } from '@/entities/Schema';
import {
  AriesCredentialFormat,
  AriesSchemaRegistration,
  CredentialFormat,
  CredentialRegistrationFormat,
  Openid4CredentialFormat,
  OpenIdVciSchemaRegistration,
  ProtocolType,
  SchemaRegistration,
  credentialFormatToCredentialRegistrationFormat,
} from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import {
  AnoncredsCredentialState,
  IssuanceSession,
  OpenIdIssuanceState,
} from '../types/credential';

export interface OfferCredentialParams {
  protocolType: ProtocolType;
  credentialType: CredentialFormat;
  schema: Schema;
  credentialValues: Record<string, string>;
  did: string;
  network: string;
  connectionId?: string;
  useDemo?: boolean;
}

export type OfferCredentialResult = IssuanceSession;

export const offerCredential = createAsyncThunk<
  OfferCredentialResult,
  OfferCredentialParams,
  ThunkConfig<string>
>('credentials/offer', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;
  try {
    switch (params.protocolType) {
      case ProtocolType.Oid4vc:
        return await offerOpenId4VcCredential(
          params.useDemo ? extra.agencyDemoApi : extra.agencyApi,
          params,
        );
      case ProtocolType.Aries:
        return await offerAriesCredential(
          params.useDemo ? extra.agencyDemoApi : extra.agencyApi,
          params,
        );
    }
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});

interface OfferOpenId4VcCredentialResponse {
  credentialOffer: string;
  issuanceSession: {
    id: string;
    state: OpenIdIssuanceState;
  };
}

const offerOpenId4VcCredential = async (
  api: AxiosInstance,
  params: OfferCredentialParams,
): Promise<OfferCredentialResult> => {
  const schemaRegistration = await getSchemaRegistration(api, {
    ...params,
    credentialFormat: credentialFormatToCredentialRegistrationFormat(
      params.credentialType,
    ),
  });
  const credentialSupportedId = (
    schemaRegistration.credentials as OpenIdVciSchemaRegistration | undefined
  )?.supportedCredentialId;
  if (!credentialSupportedId) {
    throw new Error(
      'Schema registration has no supported credential for OpenID4VC issuance',
    );
  }
  const credential = buildCredential({
    format: params.credentialType as Openid4CredentialFormat,
    did: params.did,
    credentialValues: params.credentialValues,
    credentialSupportedId,
    context: params.schema.context,
    namespace: params.schema.name,
  });
  const body = buildOpenIdCredentialOffer({
    id: params.did,
    credentials: [credential],
  });
  const response = await api.post<OfferOpenId4VcCredentialResponse>(
    agencyEndpoints.offerOpenIdCredential,
    body,
  );
  return {
    id: response.data.issuanceSession.id,
    offer: response.data.credentialOffer,
    state: response.data.issuanceSession.state,
  };
};

interface OfferAnoncredsCredentialResponse {
  id: string;
  state: AnoncredsCredentialState;
}

const offerAriesCredential = async (
  api: AxiosInstance,
  params: OfferCredentialParams,
): Promise<OfferCredentialResult> => {
  const attributes = Object.entries(params.credentialValues).map(
    ([name, value]) => ({ name, value }),
  );

  const schemaRegistration = await getSchemaRegistration(api, {
    ...params,
    credentialFormat: credentialFormatToCredentialRegistrationFormat(
      params.credentialType,
    ),
  });
  const credentialDefinitionId = (
    schemaRegistration.credentials as AriesSchemaRegistration | undefined
  )?.credentialDefinitionId;
  if (!credentialDefinitionId) {
    throw new Error('Schema registration has no credential definition');
  }
  const response = await api.post<OfferAnoncredsCredentialResponse>(
    agencyEndpoints.offerAnoncredsCredential,
    {
      connectionId: params.connectionId,
      credentialDefinitionId,
      attributes,
      format: params.credentialType as AriesCredentialFormat,
      comment: params.schema.name,
      // revocable: true, TODO: need to configure Revocation option
    },
  );
  return {
    id: response.data.id,
    offer: undefined,
    state: response.data.state,
  };
};

interface GetSchemaRegistrationParams {
  protocolType: ProtocolType;
  credentialFormat: CredentialRegistrationFormat;
  did: string;
  network: string;
  schema: Schema;
}

export const getSchemaRegistration = async (
  api: AxiosInstance,
  params: GetSchemaRegistrationParams,
): Promise<SchemaRegistration> => {
  const schemaRegistration = await api.get<SchemaRegistration>(
    agencyEndpoints.getSchemaRegistration(params.schema.id),
    {
      params: {
        protocol: params.protocolType,
        credentialFormat: params.credentialFormat,
        did: params.did,
        network: params.network,
      },
    },
  );
  if (!schemaRegistration.data) {
    throw new Error('Schema is not registered');
  }
  return schemaRegistration.data as SchemaRegistration;
};
