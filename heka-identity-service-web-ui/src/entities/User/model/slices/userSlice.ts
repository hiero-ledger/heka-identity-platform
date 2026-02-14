import { PayloadAction } from '@reduxjs/toolkit';

import {
  fetchDidDocuments,
  GetDidDocumentsResult,
} from '@/entities/User/model/services/fetchDidDocuments';
import {
  fetchDidMethods,
  FetchDidMethodsResult,
} from '@/entities/User/model/services/fetchDidMethods';
import { getAgencyUser } from '@/entities/User/model/services/getAgencyUser';
import { getProfile } from '@/entities/User/model/services/getProfile';
import { patchAgencyUser } from '@/entities/User/model/services/patchAgencyUser';
import {
  prepareWallet,
  SetupResult,
} from '@/entities/User/model/services/prepareWallet';
import { signOut } from '@/entities/User/model/services/signOut';
import {
  getAccessToken,
  getRefreshToken,
  getUserId,
} from '@/shared/api/utils/token';
import { buildSlice } from '@/shared/lib/store';

import { signIn } from '../services/signIn';
import { signUp } from '../services/signUp';
import { Tokens, UserSchema } from '../types/user';

const getInitialState = (): UserSchema => ({
  isLoading: false,
  isRegistered: false,
  isPreparing: false,
  error: undefined,
  data: {
    name: null,
    did: getUserId(),
    tokens: {
      accessToken: getAccessToken(),
      refreshToken: getRefreshToken(),
    },
  },
});

export const userSlice = buildSlice({
  name: 'users',
  initialState: getInitialState(),
  reducers: {
    reset: () => getInitialState(),
  },
  extraReducers: (builder) =>
    builder
      .addCase(getProfile.fulfilled, (state, action) => {
        state.data = {
          ...(state.data ?? {}),
          name: action.payload.name,
        };
      })
      .addCase(getAgencyUser.fulfilled, (state, action) => {
        state.data = {
          ...(state.data ?? {}),
          backgroundColor: action.payload.backgroundColor,
          issuerName: action.payload.name,
          logo: action.payload.logo,
          registeredAt: action.payload.registeredAt,
        };
      })
      .addCase(patchAgencyUser.fulfilled, (state, action) => {
        state.data = {
          ...(state.data ?? {}),
          backgroundColor: action.payload.backgroundColor,
          issuerName: action.payload.name,
          logo: action.payload.logo,
          registeredAt: action.payload.registeredAt,
        };
      })
      .addCase(signUp.pending, (state) => {
        state.isLoading = true;
        state.isRegistered = false;
        state.error = undefined;
        state.data = undefined;
      })
      .addCase(signUp.fulfilled, (state) => {
        state.isLoading = false;
        state.isRegistered = true;
        state.error = undefined;
        state.data = undefined;
      })
      .addCase(signUp.rejected, (state, payload) => {
        state.isLoading = false;
        state.isRegistered = false;
        state.error = payload.error.message;
        state.data = undefined;
      })
      .addCase(signIn.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
      })
      .addCase(signIn.fulfilled, (state, action: PayloadAction<Tokens>) => {
        state.isLoading = false;
        state.error = undefined;
        state.data = {
          tokens: action.payload,
        };
      })
      .addCase(signIn.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
        state.data = undefined;
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
          state.data = {
            ...(state.data ?? {}),
            did: action.payload.did,
          };
        },
      )
      .addCase(prepareWallet.rejected, (state, payload) => {
        state.isLoading = false;
        state.isPreparing = false;
        state.error = payload.error.message;
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
      .addCase(fetchDidMethods.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
      })
      .addCase(
        fetchDidDocuments.fulfilled,
        (state, action: PayloadAction<GetDidDocumentsResult>) => {
          state.isLoading = false;
          state.error = undefined;
          state.data = {
            ...(state.data ?? {}),
            didDocuments: action.payload.didDocuments,
          };
        },
      )
      .addCase(fetchDidDocuments.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
      })
      .addCase(signOut.pending, (state) => {
        state.isLoading = false;
        state.isRegistered = false;
        state.error = undefined;
        state.data = undefined;
      })
      .addCase(signOut.fulfilled, (state) => {
        state.isLoading = false;
        state.isRegistered = false;
        state.error = undefined;
        state.data = undefined;
      }),
});

export const {
  reducer: userReducer,
  actions: userActions,
  useActions: useUserActions,
} = userSlice;
