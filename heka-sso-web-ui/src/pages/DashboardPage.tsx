import { useAuth } from 'react-oidc-context'

const KNOWN_CLAIMS = [
  'sub',
  'given_name',
  'family_name',
  'email',
  'amr',
  'vc_presented_attributes',
] as const

function formatClaim(value: unknown): string {
  if (value === undefined) return '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function DashboardPage() {
  const auth = useAuth()
  const profile: Record<string, unknown> = auth.user?.profile ?? {}

  return (
    <main>
      <h1>Dashboard</h1>
      <p>You are signed in via Keycloak.</p>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Claim</th>
            <th style={{ textAlign: 'left' }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {KNOWN_CLAIMS.map((claim) => (
            <tr key={claim}>
              <td style={{ textAlign: 'left' }}>
                <code>{claim}</code>
              </td>
              <td style={{ textAlign: 'left' }}>{formatClaim(profile[claim])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>Raw ID token claims</summary>
        <pre style={{ textAlign: 'left' }}>{JSON.stringify(profile, null, 2)}</pre>
      </details>
      <p>
        <button onClick={() => void auth.signoutRedirect()}>Sign out</button>
      </p>
    </main>
  )
}

export default DashboardPage
