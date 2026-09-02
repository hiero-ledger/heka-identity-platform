import { useEffect, useState } from 'react'

import { useAuthSession } from './auth/session'
import { displayName } from './claims'
import { AppLayout } from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import SignInErrorPage from './pages/SignInErrorPage'
import SplashPage from './pages/SplashPage'
import WelcomePage from './pages/WelcomePage'

// Survives the logout redirect round-trip (per tab): with it set, the app
// shows the signed-out landing instead of auto-redirecting straight back
// into the IdP — which still holds a session and would silently sign the
// user in again.
const SIGNED_OUT_KEY = 'heka-sso-web-ui.signed-out'

function App() {
  const auth = useAuthSession()
  const [signedOut, setSignedOut] = useState(() => sessionStorage.getItem(SIGNED_OUT_KEY) === '1')

  // The login page is the IdP's (Keycloak or Auth0): an unauthenticated visit
  // redirects there immediately. The guards prevent redirect loops during the
  // callback exchange, after a failed sign-in, and after an explicit sign-out.
  const shouldRedirect = !signedOut && !auth.isAuthenticated && !auth.isLoading && !auth.error

  useEffect(() => {
    if (shouldRedirect) {
      auth.signIn()
    }
  }, [shouldRedirect, auth])

  const signOut = () => {
    sessionStorage.setItem(SIGNED_OUT_KEY, '1')
    setSignedOut(true)
    auth.signOut()
  }

  const signInAgain = () => {
    sessionStorage.removeItem(SIGNED_OUT_KEY)
    setSignedOut(false)
    auth.signIn()
  }

  // "Back" on the failure screen parks the app on the Welcome landing (the
  // same flag the sign-out path uses), from where "Sign in" retries.
  const backToWelcome = () => {
    sessionStorage.setItem(SIGNED_OUT_KEY, '1')
    setSignedOut(true)
  }

  // Presentation only: the auth flow is unchanged — each
  // state of the original switch maps to one screen. The landing takes
  // precedence over a stale error so "Back" from the failure screen works.
  if (auth.isAuthenticated) {
    return (
      <AppLayout userName={displayName(auth.claims)} onSignOut={signOut}>
        <DashboardPage />
      </AppLayout>
    )
  }
  if (signedOut && !auth.isLoading) {
    return <WelcomePage provider={auth.provider} signedOut onSignIn={signInAgain} />
  }
  if (auth.error) {
    return <SignInErrorPage message={auth.error} onRetry={() => auth.signIn()} onBack={backToWelcome} />
  }
  return <SplashPage provider={auth.provider} />
}

export default App
