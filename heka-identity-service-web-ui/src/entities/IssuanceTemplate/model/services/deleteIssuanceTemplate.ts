import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface DeleteIssuanceTemplateParams {
  templateId: string;
}

export interface DeleteIssuanceTemplateResult {
  templateId: string;
}

export const deleteIssuanceTemplate = createAsyncThunk<
  DeleteIssuanceTemplateResult,
  DeleteIssuanceTemplateParams,
  ThunkConfig<string>
>(
  'issuanceTemplate/deleteIssuanceTemplate',
  async ({ templateId }, thunkAPI) => {
    const { extra, rejectWithValue, dispatch } = thunkAPI;

    try {
      await extra.agencyApi.delete(
        agencyEndpoints.deleteIssuanceTemplate(templateId),
      );
      return {
        templateId,
      };
    } catch (error) {
      return handleError(error, rejectWithValue, dispatch);
    }
  },
);
