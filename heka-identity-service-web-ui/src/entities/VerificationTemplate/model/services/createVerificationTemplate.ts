import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import {
  CredentialFormat,
  ProtocolType,
  Schema,
} from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { VerificationTemplate } from '../types/verificationTemplate';

interface CreateVerificationTemplateParams {
  name: string;
  protocolType: ProtocolType;
  credentialType: CredentialFormat;
  network?: string;
  did?: string;
  schema: Schema;
  attributes: string[];
}

export const createVerificationTemplate = createAsyncThunk<
  VerificationTemplate,
  CreateVerificationTemplateParams,
  ThunkConfig<string>
>('verificationTemplate/create', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;
  const { attributes, schema } = params;

  try {
    const fields =
      schema && attributes
        ? attributes.map((attribute: string) => {
            const field = schema.fields?.find(
              (field) => field.name === attribute,
            );
            return { schemaFieldId: field?.id };
          })
        : undefined;

    const { data } = await extra.agencyApi.post(
      agencyEndpoints.createVerificationTemplate,
      {
        name: params.name,
        protocol: params.protocolType,
        credentialFormat: params.credentialType,
        network: params.network,
        did: params.did,
        schemaId: schema?.id,
        fields,
      },
    );

    return data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
