import { StateSchema } from '@/app/providers/StoreProvider';

export const getDidItems = (state: StateSchema) => state.dids?.items;

export const getDidsIsLoading = (state: StateSchema) =>
  state.dids?.isLoading ?? false;

export const getDidsError = (state: StateSchema) => state.dids?.error;

export const getDidsFailedMethods = (state: StateSchema) =>
  state.dids?.failedMethods;

/** The stored document of one of the wallet's DIDs, if the list holds it. */
export const getDidById = (did: string | undefined) => (state: StateSchema) =>
  did === undefined
    ? undefined
    : state.dids?.items?.find((doc) => doc.id === did);
