import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { agencyApi, LIST } from '@/shared/api/rtk/agencyApi';

import {
  DidDocument,
  GetAgencyUserResult,
  GetDidDocumentsParams,
} from '../model/types/user';

/** Changed only by this user (and by `prepare-wallet`), which invalidate or update it */
const USER_DATA_LIFETIME = 1800;

export const userApi = agencyApi.injectEndpoints({
  endpoints: (build) => ({
    getProfile: build.query<GetAgencyUserResult, void>({
      query: () => ({ url: agencyEndpoints.getUserData }),
      providesTags: ['Profile'],
      keepUnusedDataFor: USER_DATA_LIFETIME,
    }),
    /** The tenant's own DIDs, one cache entry per method */
    getOwnDids: build.query<DidDocument[], GetDidDocumentsParams>({
      query: ({ method }) => ({
        url: agencyEndpoints.getDids,
        params: { own: true, method },
      }),
      providesTags: [{ type: 'Did', id: LIST }],
      keepUnusedDataFor: USER_DATA_LIFETIME,
    }),
  }),
});

export const { useGetProfileQuery, useGetOwnDidsQuery } = userApi;
