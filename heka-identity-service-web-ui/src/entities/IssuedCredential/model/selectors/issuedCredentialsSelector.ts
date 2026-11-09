import { StateSchema } from '@/app/providers/StoreProvider';

export const getIssuedCredentialItems = (state: StateSchema) =>
  state.issuedCredentials?.items;

export const getIssuedCredentialsIsLoading = (state: StateSchema) =>
  state.issuedCredentials?.isLoading;

export const getIssuedCredentialsError = (state: StateSchema) =>
  state.issuedCredentials?.error;

export const getIssuedCredentialsRevokingKey = (state: StateSchema) =>
  state.issuedCredentials?.revokingKey;

export const getIssuedCredentialByKey =
  (key: string | undefined) => (state: StateSchema) =>
    key === undefined
      ? undefined
      : state.issuedCredentials?.items?.find((item) => item.key === key);
