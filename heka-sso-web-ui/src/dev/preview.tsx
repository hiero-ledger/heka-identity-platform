import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/styles/index.scss'
import App from '@/App.tsx'
import { AuthSession, AuthSessionContext } from '@/auth/session'

// Dev-only preview (preview.html): mounts <App> on a fake AuthSession so the
// screens can be checked in a browser without Keycloak/Auth0 (UI-PLAN.md
// Phase B/C visual iteration). Select the state with `?state=`.

type PreviewState = 'dashboard' | 'splash' | 'error' | 'signed-out'

const demoClaims = {
  sub: 'a3f9c1d2-7b4e-4c8a-9e21-5f6d7c8b9a01',
  given_name: 'Ada',
  family_name: 'Lovelace',
  email: 'ada@example.org',
  email_verified: false,
  amr: ['vc'],
  age_over_18: 'true',
  vc_presented_attributes: {
    'mdl.given_name': 'Ada',
    'mdl.family_name': 'Lovelace',
    'mdl.age_over_18': true,
  },
  auth_time: 1756644000,
  exp: 1756647600,
  iss: 'http://localhost:8080/realms/heka',
  aud: 'heka-sso-web-ui',
}

const SIGNED_OUT_KEY = 'heka-sso-web-ui.signed-out'

function sessionFor(state: PreviewState): AuthSession {
  const base: AuthSession = {
    provider: 'keycloak',
    isAuthenticated: false,
    isLoading: false,
    claims: {},
    signIn: () => console.info('[preview] signIn()'),
    signOut: () => console.info('[preview] signOut()'),
  }
  switch (state) {
    case 'dashboard':
      return { ...base, isAuthenticated: true, claims: demoClaims }
    case 'error':
      return { ...base, error: 'Identity provider returned an error: access_denied (the wallet request timed out).' }
    case 'signed-out':
      sessionStorage.setItem(SIGNED_OUT_KEY, '1')
      return base
    case 'splash':
    default:
      return { ...base, isLoading: true }
  }
}

const state = (new URLSearchParams(window.location.search).get('state') ?? 'dashboard') as PreviewState
if (state !== 'signed-out') sessionStorage.removeItem(SIGNED_OUT_KEY)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthSessionContext.Provider value={sessionFor(state)}>
      <App />
    </AuthSessionContext.Provider>
  </StrictMode>,
)
