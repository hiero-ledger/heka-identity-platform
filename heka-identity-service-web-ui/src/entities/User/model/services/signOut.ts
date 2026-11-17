import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyApi } from '@/shared/api/rtk/agencyApi';
import { clearUserId } from '@/shared/api/utils/token';
import { signOutSession } from '@/shared/auth/sessionBridge';

/**
 * Forgets the cached reads and the local user id, then starts the provider's logout
 * (RP-initiated, redirects back to the app).
 */
export const signOut = createAsyncThunk<void, void, ThunkConfig<string>>(
  'oauth/signOut',
  async (_, thunkAPI) => {
    const { rejectWithValue, dispatch } = thunkAPI;

    // First, so nothing of this user's data outlives the session
    dispatch(agencyApi.util.resetApiState());

    try {
      clearUserId();
      await signOutSession();
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  },
);
