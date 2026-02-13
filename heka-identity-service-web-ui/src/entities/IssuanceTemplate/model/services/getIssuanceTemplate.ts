import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import { IssuanceTemplate } from '../types/issuanceTemplate';

interface GetIssuanceTemplateParams {
  id: string;
}

export const getIssuanceTemplate = createAsyncThunk<
  IssuanceTemplate,
  GetIssuanceTemplateParams,
  ThunkConfig<string>
>('issuanceTemplate/getIssuanceTemplate', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.get<IssuanceTemplate>(
      agencyEndpoints.getSingleIssuanceTemplate(params.id),
    );

    return response.data;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
