import { createContext, useContext } from 'react';

import type { AuthProviderName } from './config';

/**
 * Provider-agnostic view of the signed-in session. Pages consume only this contract; the
 * OIDC client and the provider profile are bridged onto it by `OidcAuthProvider`.
 */
export interface AuthSession {
  provider: AuthProviderName;
  isAuthenticated: boolean;
  /** True while the OIDC client restores a session or processes the redirect callback. */
  isLoading: boolean;
  /** Human-readable sign-in failure, if any. */
  error?: string;
  /** Display name from the ID token, or `null` when signed out. */
  userName: string | null;
  /** Redirects to the provider's login page. */
  signIn: () => Promise<void>;
  /** Redirects to the provider's registration; absent when the provider offers none. */
  signUp?: () => Promise<void>;
  /** Starts the provider's password change; absent when the provider offers none. */
  changePassword?: () => Promise<void>;
  /** RP-initiated logout at the provider, then back to the app. */
  signOut: () => Promise<void>;
}

export const AuthSessionContext = createContext<AuthSession | undefined>(
  undefined,
);

export const useAuthSession = (): AuthSession => {
  const session = useContext(AuthSessionContext);
  if (!session) {
    throw new Error('useAuthSession must be used inside <OidcAuthProvider>');
  }
  return session;
};
