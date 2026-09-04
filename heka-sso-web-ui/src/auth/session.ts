import { createContext, useContext } from 'react'

export type AuthProviderName = 'keycloak' | 'auth0'

/**
 * Provider-agnostic view of the signed-in session. The app UI consumes only
 * this contract; the vendor SDKs (react-oidc-context, @auth0/auth0-react)
 * are bridged onto it by the providers in this folder.
 */
export interface AuthSession {
  provider: AuthProviderName
  isAuthenticated: boolean
  /** True while the library restores a session or processes the redirect callback. */
  isLoading: boolean
  /** Human-readable sign-in failure, if any. */
  error?: string
  /** Decoded ID-token claims of the signed-in user. */
  claims: Record<string, unknown>
  signIn: () => void
  signOut: () => void
}

export const AuthSessionContext = createContext<AuthSession | undefined>(undefined)

export function useAuthSession(): AuthSession {
  const session = useContext(AuthSessionContext)
  if (!session) {
    throw new Error('useAuthSession must be used inside <AppAuthProvider>')
  }
  return session
}
