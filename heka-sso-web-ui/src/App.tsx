import { useEffect, useState } from 'react'

import { useAuthSession } from './auth/session'
import { displayName } from './claims'
import { AppLayout } from './components/Layout'
import { copy } from './copy'
import DashboardPage from './pages/DashboardPage'
import SignInErrorPage from './pages/SignInErrorPage'
import SplashPage from './pages/SplashPage'
import WelcomePage from './pages/WelcomePage'

const SIGNED_OUT_KEY = 'heka-sso-web-ui.signed-out'

const autoSignIn = (import.meta.env.VITE_AUTO_SIGN_IN ?? 'true').toLowerCase() !== 'false'

function App() {
  const auth = useAuthSession()
  const [signedOut, setSignedOut] = useState(() => sessionStorage.getItem(SIGNED_OUT_KEY) === '1')
  const [signingOut, setSigningOut] = useState(false)

  const shouldRedirect = autoSignIn && !signedOut && !auth.isAuthenticated && !auth.isLoading && !auth.error

  useEffect(() => {
    if (shouldRedirect) {
      auth.signIn()
    }
  }, [shouldRedirect, auth])

  const signOut = () => {
    sessionStorage.setItem(SIGNED_OUT_KEY, '1')
    setSigningOut(true)
    auth.signOut()
  }

  const signInAgain = () => {
    sessionStorage.removeItem(SIGNED_OUT_KEY)
    setSignedOut(false)
    auth.signIn()
  }

  const backToWelcome = () => {
    sessionStorage.setItem(SIGNED_OUT_KEY, '1')
    setSignedOut(true)
  }

  if (signingOut) {
    return <SplashPage provider={auth.provider} direction="out" />
  }
  if (auth.isAuthenticated) {
    return (
      <AppLayout title={copy.nav.dashboard} userName={displayName(auth.claims)} onSignOut={signOut}>
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
  if (!autoSignIn && !auth.isLoading) {
    return <WelcomePage provider={auth.provider} onSignIn={() => auth.signIn()} />
  }
  return <SplashPage provider={auth.provider} />
}

export default App
