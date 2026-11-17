import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import type { AxiosResponse } from 'axios';

import type { ThunkExtraArg } from '@/app/providers/StoreProvider/config/StateSchema';

import { notifyApiError } from '../utils/error';

export interface AgencyQueryArgs {
  url: string;
  method?: 'get' | 'post' | 'patch' | 'delete';
  params?: unknown;
  data?: unknown;
  /** Send through the demo client (demo-token broker) instead of the signed-in session's */
  useDemo?: boolean;
}

export interface AgencyQueryError {
  /** HTTP status, when the server answered */
  status?: number;
  message: string;
}

/**
 * Runs RTK Query requests through the axios clients injected into the store (`extra`), so
 * cached reads keep the bearer token, the 401 renewal and the demo token of `$agencyApi` /
 * `$agencyDemoApi`. Errors are shown like the thunks show them (`handleError`).
 */
export const agencyBaseQuery: BaseQueryFn<
  AgencyQueryArgs,
  unknown,
  AgencyQueryError
> = async ({ url, method = 'get', params, data, useDemo }, api) => {
  const extra = api.extra as ThunkExtraArg;
  const client = useDemo ? extra.agencyDemoApi : extra.agencyApi;
  const config = { params };

  try {
    let response: AxiosResponse;
    // Called by method rather than through `client.request`, like the thunks do
    switch (method) {
      case 'post':
        response = await client.post(url, data, config);
        break;
      case 'patch':
        response = await client.patch(url, data, config);
        break;
      case 'delete':
        response = await client.delete(url, config);
        break;
      default:
        response = await client.get(url, config);
    }
    return { data: response.data };
  } catch (error) {
    const status = (error as { response?: { status?: number } } | undefined)
      ?.response?.status;
    return { error: { status, message: notifyApiError(error) } };
  }
};
