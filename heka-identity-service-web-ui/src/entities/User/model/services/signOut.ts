import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { clearUserId } from '@/shared/api/utils/token';
import { signOutSession } from '@/shared/auth/sessionBridge';

/** Forgets the local user id and starts the provider's logout (RP-initiated, redirects back to the app). */
export const signOut = createAsyncThunk<void, void, ThunkConfig<string>>(
  'oauth/signOut',
  async (_, thunkAPI) => {
    const { rejectWithValue } = thunkAPI;

    try {
      clearUserId();
      await signOutSession();
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  },
);
