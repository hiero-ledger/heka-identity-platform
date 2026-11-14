import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { agencyApi } from '@/shared/api/rtk/agencyApi';

import { CredentialConfig } from '../model/types/credential';

/** Static server configuration: changes only with a redeploy of the identity service */
const CREDENTIAL_CONFIG_LIFETIME = 3600;

export const credentialApi = agencyApi.injectEndpoints({
  endpoints: (build) => ({
    getCredentialConfig: build.query<CredentialConfig, void>({
      query: () => ({ url: agencyEndpoints.getCredentialConfig }),
      providesTags: ['CredentialConfig'],
      keepUnusedDataFor: CREDENTIAL_CONFIG_LIFETIME,
    }),
  }),
});

export const { useGetCredentialConfigQuery } = credentialApi;
