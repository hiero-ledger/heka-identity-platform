import { StateSchema } from '@/app/providers/StoreProvider';

export const getIssuanceTemplatesIsMutating = (state: StateSchema) =>
  state.issuanceTemplates?.isMutating;
