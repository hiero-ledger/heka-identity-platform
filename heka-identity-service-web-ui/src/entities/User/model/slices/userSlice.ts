import { PayloadAction } from '@reduxjs/toolkit';

import {
  fetchDidMethods,
  FetchDidMethodsResult,
} from '@/entities/User/model/services/fetchDidMethods';
import {
  isWalletFullyPrepared,
  prepareWallet,
  SetupResult,
} from '@/entities/User/model/services/prepareWallet';
import { agencyApi } from '@/shared/api/rtk/agencyApi';
import { getUserId } from '@/shared/api/utils/token';
import { buildSlice } from '@/shared/lib/store/buildSlice';

import { userApi } from '../../api/userApi';
import { patchAgencyUser } from '../services/patchAgencyUser';
import { signOut } from '../services/signOut';
import { UserSchema } from '../types/user';

export interface SessionPayload {
  accessToken: string;
  name: string | null;
}

const getInitialState = (): UserSchema => ({
  isLoading: false,
  isPreparing: false,
  isWalletPrepared: false,
  error: undefined,
  data: {
    name: null,
    did: getUserId(),
    tokens: {
      accessToken: null,
    },
  },
});

export const userSlice = buildSlice({
  name: 'users',
  initialState: getInitialState(),
  reducers: {
    reset: () => getInitialState(),
    /** Mirrors the OIDC session (kept by the OIDC client) into the store. */
    setSession: (state, action: PayloadAction<SessionPayload>) => {
      state.data = {
        ...(state.data ?? {}),
        name: action.payload.name,
        tokens: { accessToken: action.payload.accessToken },
      };
    },
    clearSession: (state) => {
      // A dropped session counts as a sign-out: the next session prepares the wallet again
      state.isWalletPrepared = false;
      state.data = {
        ...(state.data ?? {}),
        name: null,
        tokens: { accessToken: null },
      };
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(patchAgencyUser.fulfilled, (state, action) => {
        state.data = {
          ...(state.data ?? {}),
          backgroundColor: action.payload.backgroundColor,
          issuerName: action.payload.name,
          logo: action.payload.logo,
          registeredAt: action.payload.registeredAt,
        };
      })
      .addCase(prepareWallet.pending, (state) => {
        state.isLoading = true;
        state.isPreparing = true;
        state.error = undefined;
      })
      .addCase(
        prepareWallet.fulfilled,
        (state, action: PayloadAction<SetupResult>) => {
          state.isLoading = false;
          state.isPreparing = false;
          state.error = undefined;
          // A `failed` DID leaves it unset, so the next Home visit retries; `skipped` does not
          state.isWalletPrepared = isWalletFullyPrepared(action.payload);
          state.data = {
            ...(state.data ?? {}),
            did: action.payload.did,
          };
        },
      )
      .addCase(prepareWallet.rejected, (state, action) => {
        state.isLoading = false;
        state.isPreparing = false;
        state.error = action.payload ?? action.error.message;
      })
      .addCase(
        fetchDidMethods.fulfilled,
        (state, action: PayloadAction<FetchDidMethodsResult>) => {
          state.isLoading = false;
          state.error = undefined;
          state.data = {
            ...(state.data ?? {}),
            didMethods: action.payload.methods,
          };
        },
      )
      .addCase(fetchDidMethods.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? action.error.message;
      })
      .addCase(signOut.pending, (state) => {
        state.isLoading = false;
        state.isWalletPrepared = false;
        state.error = undefined;
        state.data = undefined;
      })
      .addCase(signOut.fulfilled, (state) => {
        state.isLoading = false;
        state.isWalletPrepared = false;
        state.error = undefined;
        state.data = undefined;
      })
      // The profile fields shown across the app mirror the cached `GET /user`
      // (matchers must follow all addCase calls)
      .addMatcher(
        userApi.endpoints.getProfile.matchFulfilled,
        (state, action) => {
          state.data = {
            ...(state.data ?? {}),
            backgroundColor: action.payload.backgroundColor,
            issuerName: action.payload.name,
            logo: action.payload.logo,
            registeredAt: action.payload.registeredAt,
          };
        },
      )
      // The cache is reset when the user changes (sign-out, session drop, another subject):
      // prepare the next user's wallet again
      .addMatcher(agencyApi.util.resetApiState.match, (state) => {
        state.isWalletPrepared = false;
      }),
});

export const {
  reducer: userReducer,
  actions: userActions,
  useActions: useUserActions,
} = userSlice;
