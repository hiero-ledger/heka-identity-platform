import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { PropsWithChildren, useMemo } from 'react'

import { AuthSession, AuthSessionContext } from './session'

const auth0Domain: string = import.meta.env.VITE_AUTH0_DOMAIN
const auth0ClientId: string = import.meta.env.VITE_AUTH0_CLIENT_ID
const auth0Connection: string | undefined = import.meta.env.VITE_AUTH0_CONNECTION || undefined

function Auth0SessionBridge({ children }: PropsWithChildren) {
  const { isAuthenticated, isLoading, error, user, loginWithRedirect, logout } = useAuth0()

  const session = useMemo<AuthSession>(
    () => ({
      provider: 'auth0',
      isAuthenticated,
      isLoading,
      error: error?.message,
      claims: (user ?? {}) as Record<string, unknown>,
      signIn: () => void loginWithRedirect(),
      signOut: () => void logout({ logoutParams: { returnTo: window.location.origin, federated: true } }),
    }),
    [isAuthenticated, isLoading, error, user, loginWithRedirect, logout]
  )

  return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>
}

function Auth0AuthProvider({ children }: PropsWithChildren) {
  return (
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(auth0Connection ? { connection: auth0Connection } : {}),
      }}
    >
      <Auth0SessionBridge>{children}</Auth0SessionBridge>
    </Auth0Provider>
  )
}

export default Auth0AuthProvider
