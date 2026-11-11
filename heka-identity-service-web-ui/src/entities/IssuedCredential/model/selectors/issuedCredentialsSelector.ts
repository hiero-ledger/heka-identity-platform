import { StateSchema } from '@/app/providers/StoreProvider';

export const getIssuedCredentialItems = (state: StateSchema) =>
  state.issuedCredentials?.items;

export const getIssuedCredentialsIsLoading = (state: StateSchema) =>
  state.issuedCredentials?.isLoading;

export const getIssuedCredentialsError = (state: StateSchema) =>
  state.issuedCredentials?.error;

/** Whether a revocation of the credential with this key is in flight */
export const getIsIssuedCredentialRevoking =
  (key: string | undefined) => (state: StateSchema) =>
    key !== undefined &&
    Object.values(state.issuedCredentials?.revokingRequests ?? {}).includes(key);

export const getIssuedCredentialByKey =
  (key: string | undefined) => (state: StateSchema) =>
    key === undefined
      ? undefined
      : state.issuedCredentials?.items?.find((item) => item.key === key);
