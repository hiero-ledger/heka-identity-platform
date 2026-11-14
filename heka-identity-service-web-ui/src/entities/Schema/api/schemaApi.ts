import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { agencyApi, LIST } from '@/shared/api/rtk/agencyApi';
import { signedInOnly } from '@/shared/api/rtk/signedInOnly';

import { Schema, SchemasParams, SchemasResponse } from '../model/types/schema';

/** Schemas of the tenant may also be changed by other members of an org tenant: kept 5 min */
const SCHEMA_LIST_LIFETIME = 300;

export const schemaApi = agencyApi.injectEndpoints({
  endpoints: (build) => ({
    /** Always pass the filter in the same shape (`{ isHidden: false }`): it is the cache key */
    getSchemaList: build.query<Schema[], SchemasParams>({
      query: (params) => ({ url: agencyEndpoints.getSchemaList, params }),
      transformResponse: (response: SchemasResponse) => response.items,
      providesTags: (result) => [
        { type: 'Schema', id: LIST },
        ...(result ?? []).map((schema) => ({
          type: 'Schema' as const,
          id: schema.id,
        })),
      ],
      keepUnusedDataFor: SCHEMA_LIST_LIFETIME,
    }),
    /** The demo tenant's schemas: a cache entry of its own, read with the demo client */
    getDemoSchemaList: build.query<Schema[], void>({
      query: () => ({ url: agencyEndpoints.getSchemaList, useDemo: true }),
      transformResponse: (response: SchemasResponse) => response.items,
      providesTags: [{ type: 'DemoSchema', id: LIST }],
      keepUnusedDataFor: SCHEMA_LIST_LIFETIME,
    }),
  }),
});

/** The tenant's lists: skipped while signed out */
export const useGetSchemaListQuery = signedInOnly(
  schemaApi.useGetSchemaListQuery,
);
/** The demo tenant's list: read with the demo token, also for visitors */
export const { useGetDemoSchemaListQuery } = schemaApi;
