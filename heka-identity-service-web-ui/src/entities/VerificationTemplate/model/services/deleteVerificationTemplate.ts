import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface DeleteVerificationTemplateParams {
  templateId: string;
}

export interface DeleteVerificationTemplateResult {
  templateId: string;
}

export const deleteVerificationTemplate = createAsyncThunk<
  DeleteVerificationTemplateResult,
  DeleteVerificationTemplateParams,
  ThunkConfig<string>
>(
  'verificationTemplate/deleteVerificationTemplate',
  async ({ templateId }, thunkAPI) => {
    const { extra, rejectWithValue, dispatch } = thunkAPI;

    try {
      await extra.agencyApi.delete(
        agencyEndpoints.deleteVerificationTemplate(templateId),
      );
      return {
        templateId,
      };
    } catch (error) {
      return handleError(error, rejectWithValue, dispatch);
    }
  },
);
