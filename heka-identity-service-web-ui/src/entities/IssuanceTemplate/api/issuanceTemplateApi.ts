import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { agencyApi, LIST } from '@/shared/api/rtk/agencyApi';
import { isNotFound } from '@/shared/api/rtk/isNotFound';

import {
  IssuanceTemplate,
  IssuanceTemplateList,
} from '../model/types/issuanceTemplate';

/** Owned by the user, but they embed schema data other org members can change: kept 5 min */
const TEMPLATE_LIFETIME = 300;

export const issuanceTemplateApi = agencyApi.injectEndpoints({
  endpoints: (build) => ({
    /** No params: the page searches on the client, so the list has a single cache entry */
    getIssuanceTemplateList: build.query<IssuanceTemplate[], void>({
      query: () => ({ url: agencyEndpoints.getIssuanceTemplateList }),
      transformResponse: (response: IssuanceTemplateList) => response.items,
      providesTags: (result) => [
        { type: 'IssuanceTemplate', id: LIST },
        ...(result ?? []).map((template) => ({
          type: 'IssuanceTemplate' as const,
          id: template.id,
        })),
      ],
      keepUnusedDataFor: TEMPLATE_LIFETIME,
    }),
    getIssuanceTemplate: build.query<IssuanceTemplate, string>({
      query: (id) => ({ url: agencyEndpoints.getSingleIssuanceTemplate(id) }),
      providesTags: (_result, _error, id) => [{ type: 'IssuanceTemplate', id }],
      keepUnusedDataFor: TEMPLATE_LIFETIME,
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch (error) {
          // Deleted elsewhere (another tab or device): drop it from the cached list too
          if (isNotFound(error)) {
            dispatch(
              agencyApi.util.invalidateTags([
                { type: 'IssuanceTemplate', id: LIST },
              ]),
            );
          }
        }
      },
    }),
  }),
});

export const { useGetIssuanceTemplateListQuery, useGetIssuanceTemplateQuery } =
  issuanceTemplateApi;
