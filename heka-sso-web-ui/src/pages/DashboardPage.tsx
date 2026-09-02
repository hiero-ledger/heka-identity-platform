import { useAuthSession } from '../auth/session'

import styles from './DashboardPage.module.scss'

const KNOWN_CLAIMS = [
  'sub',
  'given_name',
  'family_name',
  'email',
  'amr',
  'vc_presented_attributes',
] as const

const PROVIDER_LABELS = {
  keycloak: 'Keycloak',
  auth0: 'Auth0',
} as const

function formatClaim(value: unknown): string {
  if (value === undefined) return '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function DashboardPage() {
  const auth = useAuthSession()
  const claims = auth.claims

  return (
    <section className={styles.card}>
      <div>
        <h1 className={styles.heading}>Dashboard</h1>
        <p className={styles.subheading}>You are signed in via {PROVIDER_LABELS[auth.provider]}.</p>
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
              <td>{formatClaim(claims[claim])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className={styles.debug}>
        <summary>Raw ID token claims</summary>
        <pre>{JSON.stringify(claims, null, 2)}</pre>
      </details>
    </section>
  )
}

export default DashboardPage
