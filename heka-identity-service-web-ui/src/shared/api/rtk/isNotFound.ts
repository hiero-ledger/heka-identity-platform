import type { AgencyQueryError } from './agencyBaseQuery';

/** Whether a rejected `queryFulfilled` (in `onQueryStarted`) is the server's 404 */
export const isNotFound = (rejection: unknown): boolean =>
  (rejection as { error?: Partial<AgencyQueryError> } | undefined)?.error
    ?.status === 404;
