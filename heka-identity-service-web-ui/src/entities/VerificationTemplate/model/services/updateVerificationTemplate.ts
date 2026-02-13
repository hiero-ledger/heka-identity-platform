import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { ProtocolType, Schema } from '@/entities/Schema';
import { CredentialFormat } from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface UpdateVerificationTemplateParams {
  templateId: string;
  params: {
    name?: string;
    protocolType?: ProtocolType;
    credentialType?: CredentialFormat;
    network?: string;
    did?: string;
    schema?: Schema;
    attributes?: string[];
    previousTemplateId?: string;
  };
}

export const updateVerificationTemplate = createAsyncThunk<
  void,
  UpdateVerificationTemplateParams,
  ThunkConfig<string>
>(
  'verificationTemplate/updateVerificationTemplate',
  async ({ templateId, params }, thunkAPI) => {
    const { extra, rejectWithValue, dispatch } = thunkAPI;
    const {
      name,
      protocolType,
      credentialType,
      network,
      did,
      schema,
      attributes,
      previousTemplateId,
    } = params;

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

      await extra.agencyApi.patch(
        agencyEndpoints.updateVerificationTemplate(templateId),
        {
          name,
          protocol: protocolType,
          credentialFormat: credentialType,
          network,
          did,
          schemaId: schema?.id,
          fields,
          previousTemplateId,
        },
      );
    } catch (error) {
      return handleError(error, rejectWithValue, dispatch);
    }
  },
);
