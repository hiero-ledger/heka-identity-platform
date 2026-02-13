import { StateSchema } from '@/app/providers/StoreProvider';
import {
  AnoncredsCredentialState,
  OpenIdIssuanceState,
} from '@/entities/Credential/model/types/credential';

export const getCredentialOfferIsLoading = (state: StateSchema) =>
  state.credentials.isLoading;

export const getCredentialOffer = (state: StateSchema) =>
  state.credentials.issuanceSession?.offer;

export const getCredentialState = (state: StateSchema) =>
  state.credentials.issuanceSession?.state;

export const getCredentialOfferId = (state: StateSchema) =>
  state.credentials.issuanceSession?.id;

export const getIsCredentialSent = (state: StateSchema) => {
  const credentialState = state.credentials.issuanceSession?.state;
  return (
    credentialState === OpenIdIssuanceState.Completed ||
    credentialState === AnoncredsCredentialState.OfferSent ||
    credentialState === AnoncredsCredentialState.RequestReceived ||
    credentialState === AnoncredsCredentialState.CredentialIssued ||
    credentialState === AnoncredsCredentialState.Done
  );
};

export const getCredentialsConfig = (state: StateSchema) =>
  state.credentials.credentialsConfig;
