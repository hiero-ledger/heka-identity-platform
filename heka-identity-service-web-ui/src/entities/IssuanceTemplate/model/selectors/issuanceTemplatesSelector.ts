import { StateSchema } from '@/app/providers/StoreProvider';

export const getIssuanceTemplates = (state: StateSchema) =>
  state.issuanceTemplates?.issuanceTemplates;

export const getIssuanceTemplate = (state: StateSchema) =>
  state.issuanceTemplates?.issuanceTemplate;

export const getIssuanceTemplatesIsLoading = (state: StateSchema) =>
  state.issuanceTemplates?.isLoading;

export const getIssuanceTemplatesError = (state: StateSchema) =>
  state.issuanceTemplates?.error;
