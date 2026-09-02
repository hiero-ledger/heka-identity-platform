import { PropsWithChildren } from 'react'

import Auth0AuthProvider from './Auth0AuthProvider'
import KeycloakAuthProvider from './KeycloakAuthProvider'
import { AuthProviderName } from './session'

const providerName = (import.meta.env.VITE_AUTH_PROVIDER || 'keycloak') as string

/**
 * Selects the auth stack from `VITE_AUTH_PROVIDER` (`keycloak` — default — or
 * `auth0`). Everything below this component is provider-agnostic and works
 * against the `AuthSession` contract.
 */
function AppAuthProvider({ children }: PropsWithChildren) {
  switch (providerName.toLowerCase() as AuthProviderName) {
    case 'auth0':
      return <Auth0AuthProvider>{children}</Auth0AuthProvider>
    case 'keycloak':
      return <KeycloakAuthProvider>{children}</KeycloakAuthProvider>
    default:
      return (
        <p>
          Unknown <code>VITE_AUTH_PROVIDER</code> value: <code>{providerName}</code> — expected <code>keycloak</code> or <code>auth0</code>.
        </p>
      )
  }
}

export default AppAuthProvider
