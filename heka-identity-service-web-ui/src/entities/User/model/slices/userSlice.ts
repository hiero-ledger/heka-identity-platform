import { PayloadAction } from '@reduxjs/toolkit';

import {
  fetchDidDocuments,
  GetDidDocumentsResult,
} from '@/entities/User/model/services/fetchDidDocuments';
import {
  fetchDidMethods,
  FetchDidMethodsResult,
} from '@/entities/User/model/services/fetchDidMethods';
import {
  prepareWallet,
  SetupResult,
} from '@/entities/User/model/services/prepareWallet';
import { getUserId } from '@/shared/api/utils/token';
import { buildSlice } from '@/shared/lib/store/buildSlice';

import { getAgencyUser } from '../services/getAgencyUser';
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
      state.data = {
        ...(state.data ?? {}),
        name: null,
        tokens: { accessToken: null },
      };
    },
  },
  extraReducers: (builder) =>
    builder
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
        state.error = undefined;
        state.data = undefined;
      })
      .addCase(signOut.fulfilled, (state) => {
        state.isLoading = false;
        state.error = undefined;
        state.data = undefined;
      }),
});

export const {
  reducer: userReducer,
  actions: userActions,
  useActions: useUserActions,
} = userSlice;
