import { createApi } from '@reduxjs/toolkit/query/react';

import { agencyBaseQuery } from './agencyBaseQuery';

/**
 * Cache of the identity service reads. Endpoints are injected by the entities
 * (`entities/<Entity>/api/*Api.ts`); writes stay thunks and invalidate the tags below.
 *
 * The cache lives in memory only: a reload, sign-out or a change of user clears it.
 * Each endpoint sets its own `keepUnusedDataFor` (seconds after its last subscriber unmounts).
 */
export const agencyApi = createApi({
  reducerPath: 'agencyApi',
  baseQuery: agencyBaseQuery,
  tagTypes: [
    'Schema',
    'DemoSchema',
    'Profile',
    'CredentialConfig',
    'Did',
    'IssuanceTemplate',
    'VerificationTemplate',
  ],
  keepUnusedDataFor: 300,
  refetchOnMountOrArgChange: false,
  refetchOnFocus: false,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});

/** Tag id of a type's list entries */
export const LIST = 'LIST';
