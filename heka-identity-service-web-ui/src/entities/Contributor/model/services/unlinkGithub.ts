import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

/** Removes the user's GitHub binding; credentials issued for it stay valid until they expire */
export const unlinkGithub = createAsyncThunk<void, void, ThunkConfig<string>>(
  'contributor/unlinkGithub',
  async (_, thunkAPI) => {
    const { extra, rejectWithValue, dispatch } = thunkAPI;

    try {
      await extra.agencyApi.delete(agencyEndpoints.unlinkGithub);
    } catch (error) {
      return handleError(error, rejectWithValue, dispatch);
    }
  },
);
