import { useState } from 'react';

interface QueryErrorState {
  isError: boolean;
  error?: unknown;
  requestId?: string;
}

/**
 * The query's error, if it comes from a request sent after the component mounted. A failed
 * entry stays cached like a successful one, so on its first render the next visit would see the
 * previous visit's error, before its own request has started.
 */
export const useErrorSinceMount = ({
  isError,
  error,
  requestId,
}: QueryErrorState): unknown => {
  const [requestIdAtMount] = useState(requestId);
  return isError && requestId !== requestIdAtMount ? error : undefined;
};
