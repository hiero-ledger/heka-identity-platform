import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { ProtocolType, Schema } from '@/entities/Schema';
import { CredentialFormat } from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface UpdateIssuanceTemplateParams {
  templateId: string;
  params: {
    name?: string;
    protocolType?: ProtocolType;
    credentialType?: CredentialFormat;
    network?: string;
    did?: string;
    schema?: Schema;
    credentialValues?: Record<string, string>;
    previousTemplateId?: string;
  };
}

export const updateIssuanceTemplate = createAsyncThunk<
  void,
  UpdateIssuanceTemplateParams,
  ThunkConfig<string>
>(
  'issuanceTemplate/updateIssuanceTemplate',
  async ({ templateId, params }, thunkAPI) => {
    const { extra, rejectWithValue, dispatch } = thunkAPI;
    const {
      name,
      protocolType,
      credentialType,
      network,
      did,
      schema,
      credentialValues,
      previousTemplateId,
    } = params;

    try {
      const fields =
        schema && credentialValues
          ? schema.fields?.map((schemaField) => ({
              schemaFieldId: schemaField.id,
              value: credentialValues[schemaField.name],
            }))
          : undefined;

      await extra.agencyApi.patch(
        agencyEndpoints.updateIssuanceTemplate(templateId),
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
