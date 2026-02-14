import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import {
  VerificationTemplate,
  VerificationTemplateList,
} from '../types/verificationTemplate';

export type GetVerificationTemplateListParams = {
  offset?: number;
  limit?: number;
  text?: string;
};

export const getVerificationTemplateList = createAsyncThunk<
  VerificationTemplate[],
  GetVerificationTemplateListParams | undefined,
  ThunkConfig<string>
>(
  'verificationTemplate/getVerificationTemplateList',
  async (params, thunkAPI) => {
    const { extra, rejectWithValue, dispatch } = thunkAPI;

    try {
      const response = await extra.agencyApi.get<VerificationTemplateList>(
        agencyEndpoints.getVerificationTemplateList,
        {
          params,
        },
      );

      return response.data.items;
    } catch (error) {
      return handleError(error, rejectWithValue, dispatch);
    }
  },
);
