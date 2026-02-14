import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import {
  CredentialFormat,
  ProtocolType,
  Schema,
} from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { IssuanceTemplate } from '../types/issuanceTemplate';

interface CreateIssuanceTemplateParams {
  name: string;
  protocolType: ProtocolType;
  credentialType: CredentialFormat;
  network: string;
  did: string;
  schema: Schema;
  credentialValues: Record<string, string>;
}

export const createIssuanceTemplate = createAsyncThunk<
  IssuanceTemplate,
  CreateIssuanceTemplateParams,
  ThunkConfig<string>
>('issuanceTemplate/create', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const fields = params.schema?.fields?.map((schemaField) => ({
      schemaFieldId: schemaField.id,
      value:
        params.credentialValues && params.credentialValues[schemaField.name],
    }));

    const { data } = await extra.agencyApi.post(
      agencyEndpoints.createIssuanceTemplate,
      {
        name: params.name,
        protocol: params.protocolType,
        credentialFormat: params.credentialType,
        network: params.network,
        did: params.did,
        schemaId: params.schema?.id,
        fields,
      },
    );

    return data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
