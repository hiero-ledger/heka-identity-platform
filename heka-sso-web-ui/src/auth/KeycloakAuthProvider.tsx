import { PropsWithChildren, useMemo } from 'react'
import { AuthProvider, AuthProviderProps, useAuth } from 'react-oidc-context'

import { AuthSession, AuthSessionContext } from './session'

const kcUrl: string = import.meta.env.VITE_KC_URL
const kcRealm: string = import.meta.env.VITE_KC_REALM
const kcClientId: string = import.meta.env.VITE_KC_CLIENT_ID

const authConfig: AuthProviderProps = {
  authority: `${kcUrl}/realms/${kcRealm}`,
  client_id: kcClientId,
  redirect_uri: window.location.origin,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  onSigninCallback: () => {
    // Strip code/state from the URL after the redirect returns
    window.history.replaceState({}, document.title, window.location.pathname)
  }
}

function KeycloakSessionBridge({ children }: PropsWithChildren) {
  const auth = useAuth()

  const session = useMemo<AuthSession>(
    () => ({
      provider: 'keycloak',
      isAuthenticated: auth.isAuthenticated,
      // activeNavigator covers the signin/signout redirects in flight
      isLoading: auth.isLoading || !!auth.activeNavigator,
      error: auth.error?.message,
      claims: (auth.user?.profile ?? {}) as Record<string, unknown>,
      signIn: () => void auth.signinRedirect(),
      signOut: () => void auth.signoutRedirect()
    }),
    [auth]
  )

  return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>
}

function KeycloakAuthProvider({ children }: PropsWithChildren) {
  return (
    <AuthProvider {...authConfig}>
      <KeycloakSessionBridge>{children}</KeycloakSessionBridge>
    </AuthProvider>
  )
}

export default KeycloakAuthProvider
