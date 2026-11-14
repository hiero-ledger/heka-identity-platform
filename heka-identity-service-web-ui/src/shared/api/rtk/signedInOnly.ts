import { useSelector } from 'react-redux';

import type { StateSchema } from '@/app/providers/StoreProvider/config/StateSchema';

/** Same rule as the user entity's `getUserIsSignedIn`: the mirrored OIDC access token */
const hasSession = (state: StateSchema) =>
  !!state.user?.data?.tokens?.accessToken;

type AnyQueryHook = (arg: never, options?: never) => unknown;

/**
 * Wraps a query hook of the signed-in tenant so it is skipped while nobody is signed in.
 * When the session drops, the cache is reset (`SessionBridge`) and mounted hooks would
 * otherwise fetch again without a token. Demo queries (demo token) are not wrapped.
 */
export const signedInOnly = <Hook extends AnyQueryHook>(
  useQuery: Hook,
): Hook => {
  function useSignedInQuery(arg: unknown, options?: { skip?: boolean }) {
    const isSignedIn = useSelector(hasSession);
    return (useQuery as unknown as (arg: unknown, options?: object) => unknown)(
      arg,
      { ...options, skip: !isSignedIn || !!options?.skip },
    );
  }
  return useSignedInQuery as unknown as Hook;
};
