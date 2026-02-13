import { StateSchema } from '@/app/providers/StoreProvider';

export const getUserIsSignedIn = (state: StateSchema) =>
  !!state.user.data?.tokens?.accessToken;

export const getUserAccessToken = (state: StateSchema) =>
  state.user.data?.tokens?.accessToken;

export const getUserIsRegistered = (state: StateSchema) =>
  !!state.user?.isRegistered;

export const getUserDid = (state: StateSchema) => state.user?.data?.did;

export const getUserDidMethods = (state: StateSchema) =>
  state.user?.data?.didMethods;

export const getUserDidDocuments = (state: StateSchema) =>
  state.user?.data?.didDocuments;

export const getUserId = (state: StateSchema) => state.user?.data?.did;

export const getUserError = (state: StateSchema) => state.user?.error;

export const getIsPreparingUser = (state: StateSchema) =>
  state.user?.isPreparing;

export const getUserName = (state: StateSchema) => state.user?.data?.name;
export const getUser = (state: StateSchema) => state.user?.data;
