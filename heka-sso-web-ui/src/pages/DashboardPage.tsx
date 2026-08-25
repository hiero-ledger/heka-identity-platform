import { useAuth } from 'react-oidc-context'

import styles from './DashboardPage.module.scss'

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
    <section className={styles.card}>
      <div>
        <h1 className={styles.heading}>Dashboard</h1>
        <p className={styles.subheading}>You are signed in via Keycloak.</p>
      </div>
      <table className={styles.claims}>
        <thead>
          <tr>
            <th>Claim</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {KNOWN_CLAIMS.map((claim) => (
            <tr key={claim}>
              <td>
                <code>{claim}</code>
              </td>
              <td>{formatClaim(profile[claim])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className={styles.debug}>
        <summary>Raw ID token claims</summary>
        <pre>{JSON.stringify(profile, null, 2)}</pre>
      </details>
    </section>
  )
}

export default DashboardPage
