import type { AgencyQueryError } from './agencyBaseQuery';

/** Whether a query `error` (from a hook) is the server's 404 */
export const isNotFoundError = (error: unknown): boolean =>
  (error as Partial<AgencyQueryError> | undefined)?.status === 404;

/** Whether a rejected `queryFulfilled` (in `onQueryStarted`) is the server's 404 */
export const isNotFound = (rejection: unknown): boolean =>
  isNotFoundError((rejection as { error?: unknown } | undefined)?.error);
