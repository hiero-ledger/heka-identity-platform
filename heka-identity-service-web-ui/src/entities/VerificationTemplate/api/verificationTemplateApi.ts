import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { agencyApi, LIST } from '@/shared/api/rtk/agencyApi';
import { isNotFound } from '@/shared/api/rtk/isNotFound';

import {
  VerificationTemplate,
  VerificationTemplateList,
} from '../model/types/verificationTemplate';

/** Owned by the user, but they embed schema data other org members can change: kept 5 min */
const TEMPLATE_LIFETIME = 300;

export const verificationTemplateApi = agencyApi.injectEndpoints({
  endpoints: (build) => ({
    /** No params: the page searches on the client, so the list has a single cache entry */
    getVerificationTemplateList: build.query<VerificationTemplate[], void>({
      query: () => ({ url: agencyEndpoints.getVerificationTemplateList }),
      transformResponse: (response: VerificationTemplateList) => response.items,
      providesTags: (result) => [
        { type: 'VerificationTemplate', id: LIST },
        ...(result ?? []).map((template) => ({
          type: 'VerificationTemplate' as const,
          id: template.id,
        })),
      ],
      keepUnusedDataFor: TEMPLATE_LIFETIME,
    }),
    getVerificationTemplate: build.query<VerificationTemplate, string>({
      query: (id) => ({
        url: agencyEndpoints.getSingleVerificationTemplate(id),
      }),
      providesTags: (_result, _error, id) => [
        { type: 'VerificationTemplate', id },
      ],
      keepUnusedDataFor: TEMPLATE_LIFETIME,
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch (error) {
          // Deleted elsewhere (another tab or device): drop it from the cached list too
          if (isNotFound(error)) {
            dispatch(
              agencyApi.util.invalidateTags([
                { type: 'VerificationTemplate', id: LIST },
              ]),
            );
          }
        }
      },
    }),
  }),
});

export const {
  useGetVerificationTemplateListQuery,
  useGetVerificationTemplateQuery,
} = verificationTemplateApi;
