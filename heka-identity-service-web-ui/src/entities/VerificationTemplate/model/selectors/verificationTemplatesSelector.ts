import { StateSchema } from '@/app/providers/StoreProvider';

export const getVerificationTemplates = (state: StateSchema) =>
  state.verificationTemplates?.verificationTemplates;

export const getVerificationTemplate = (state: StateSchema) =>
  state.verificationTemplates?.verificationTemplate;

export const getVerificationTemplatesIsLoading = (state: StateSchema) =>
  state.verificationTemplates?.isLoading;

export const getVerificationTemplatesError = (state: StateSchema) =>
  state.verificationTemplates?.error;
