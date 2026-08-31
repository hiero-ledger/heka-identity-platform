import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/styles/index.scss'
import App from '@/App.tsx'
import { AuthSession, AuthSessionContext } from '@/auth/session'

// Dev-only preview (preview.html): mounts <App> on a fake AuthSession so the
// screens can be checked in a browser without Keycloak/Auth0 (UI-PLAN.md
// Phase B/C visual iteration). Select the state with `?state=`:
//   dashboard        Keycloak-shaped claims (mapped attributes, amr array)
//   dashboard-auth0  Auth0-shaped claims (namespaced custom claims)
//   dashboard-full   bridge-direct claims incl. vc_presented_attributes
//   dashboard-bare   minimal claims (nothing disclosed) — fallbacks
//   welcome | signed-out | error | splash

type PreviewState =
  | 'dashboard'
  | 'dashboard-auth0'
  | 'dashboard-full'
  | 'dashboard-bare'
  | 'welcome'
  | 'signed-out'
  | 'error'
  | 'splash'

const now = Math.floor(Date.now() / 1000)
const base = {
  sub: 'a3f9c1d2-7b4e-4c8a-9e21-5f6d7c8b9a01',
  iss: 'http://localhost:8080/realms/heka',
  aud: 'heka-sso-web-ui',
  auth_time: now - 90,
  exp: now + 3600,
}

const keycloakClaims = {
  ...base,
  given_name: 'Ada',
  family_name: 'Lovelace',
  name: 'Ada Lovelace',
  preferred_username: 'ada',
  email_verified: false,
  age_over_18: 'true',
  amr: ['vc'],
}

const auth0Claims = {
  ...base,
  iss: 'https://heka-demo.eu.auth0.com/',
  given_name: 'Ada',
  family_name: 'Lovelace',
  email: 'ada@example.org',
  'https://heka.dsr-corporation.com/amr': ['vc'],
  'https://heka.dsr-corporation.com/age_over_18': true,
  'https://heka.dsr-corporation.com/vc_presented_attributes': {
    'mdl.given_name': 'Ada',
    'mdl.family_name': 'Lovelace',
    'mdl.age_over_18': true,
  },
}

const fullClaims = {
  ...keycloakClaims,
  email: 'ada@example.org',
  vc_presented_attributes: {
    'mdl.given_name': 'Ada',
    'mdl.family_name': 'Lovelace',
    'mdl.age_over_18': true,
    'mdl.document_number': 'DL-123456789',
  },
}

const SIGNED_OUT_KEY = 'heka-sso-web-ui.signed-out'

function sessionFor(state: PreviewState): AuthSession {
  const session: AuthSession = {
    provider: 'keycloak',
    isAuthenticated: false,
    isLoading: false,
    claims: {},
    signIn: () => console.info('[preview] signIn()'),
    signOut: () => console.info('[preview] signOut()'),
  }
  switch (state) {
    case 'dashboard':
      return { ...session, isAuthenticated: true, claims: keycloakClaims }
    case 'dashboard-auth0':
      return { ...session, provider: 'auth0', isAuthenticated: true, claims: auth0Claims }
    case 'dashboard-full':
      return { ...session, isAuthenticated: true, claims: fullClaims }
    case 'dashboard-bare':
      return { ...session, isAuthenticated: true, claims: { sub: base.sub, amr: ['pwd'] } }
    case 'error':
      return { ...session, error: 'Identity provider returned an error: access_denied (the wallet request timed out).' }
    case 'welcome':
    case 'signed-out':
      sessionStorage.setItem(SIGNED_OUT_KEY, '1')
      return session
    case 'splash':
    default:
      return { ...session, isLoading: true }
  }
}

const state = (new URLSearchParams(window.location.search).get('state') ?? 'dashboard') as PreviewState
if (state !== 'welcome' && state !== 'signed-out') sessionStorage.removeItem(SIGNED_OUT_KEY)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthSessionContext.Provider value={sessionFor(state)}>
      <App />
    </AuthSessionContext.Provider>
  </StrictMode>,
)
