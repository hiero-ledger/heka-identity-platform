import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import {
  IssuanceTemplate,
  IssuanceTemplateList,
} from '../types/issuanceTemplate';

export type GetIssuanceTemplateListParams = {
  offset?: number;
  limit?: number;
  text?: string;
};

export const getIssuanceTemplateList = createAsyncThunk<
  IssuanceTemplate[],
  GetIssuanceTemplateListParams | undefined,
  ThunkConfig<string>
>('issuanceTemplate/getIssuanceTemplateList', async (params, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const response = await extra.agencyApi.get<IssuanceTemplateList>(
      agencyEndpoints.getIssuanceTemplateList,
      {
        params,
      },
    );

    return response.data.items;
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
