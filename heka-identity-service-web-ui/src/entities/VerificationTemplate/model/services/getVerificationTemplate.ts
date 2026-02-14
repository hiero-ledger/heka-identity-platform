import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { VerificationTemplate } from '../types/verificationTemplate';

interface GetVerificationTemplateParams {
  id: string;
}

export const getVerificationTemplate = createAsyncThunk<
  VerificationTemplate,
  GetVerificationTemplateParams,
  ThunkConfig<string>
>('verificationTemplate/getVerificationTemplate', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.get<VerificationTemplate>(
      agencyEndpoints.getSingleVerificationTemplate(params.id),
    );

    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
