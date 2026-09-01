import { useEffect } from 'react'
import { useAuth } from 'react-oidc-context'
import DashboardPage from './pages/DashboardPage'

function App() {
  const auth = useAuth()

  // The login page is Keycloak's: an unauthenticated visit redirects there
  // immediately. The guards prevent redirect loops during the callback
  // exchange and after a failed sign-in.
  const shouldRedirect =
    !auth.isAuthenticated && !auth.isLoading && !auth.activeNavigator && !auth.error

  useEffect(() => {
    if (shouldRedirect) {
      void auth.signinRedirect()
    }
  }, [shouldRedirect, auth])

  if (auth.error) {
    return (
      <main>
        <h1>Sign-in failed</h1>
        <p>{auth.error.message}</p>
        <button onClick={() => void auth.signinRedirect()}>Try again</button>
      </main>
    )
  }

  if (auth.isAuthenticated) {
    return <DashboardPage />
  }

  return (
    <main>
      <p>Signing in…</p>
    </main>
  )
}

export default App
