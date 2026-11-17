import { StateSchema } from '@/app/providers/StoreProvider';

export const getVerificationTemplatesIsMutating = (state: StateSchema) =>
  state.verificationTemplates?.isMutating;
