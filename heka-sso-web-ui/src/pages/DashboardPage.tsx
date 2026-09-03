import { ReactNode } from 'react'

import { useAuthSession } from '@/auth/session'
import {
  ageOver18,
  amrValues,
  email,
  firstName,
  formatTimestamp,
  lastName,
  claim,
  signedInWithWallet,
  subject,
} from '@/claims'
import Badge from '@/components/Badge/Badge'
import Card from '@/components/Card/Card'
import KeyValueList, { KeyValueItem } from '@/components/KeyValueList/KeyValueList'
import { copy } from '@/copy'

import styles from './DashboardPage.module.scss'

function orNotShared(value: string | undefined): ReactNode {
  return value ?? <span className={styles.muted}>{copy.common.notShared}</span>
}

/**
 * The signed-in screen: greeting, the wallet-presented
 * identity, the session facts, and the raw claims for debugging mapper
 * configuration (kept collapsed).
 */
function DashboardPage() {
  const { claims, provider } = useAuthSession()
  const providerLabel = copy.providers[provider]
  const wallet = signedInWithWallet(claims)
  const adult = ageOver18(claims)
  const amr = amrValues(claims)

  const identity: KeyValueItem[] = [
    { key: 'given_name', label: copy.dashboard.identity.givenName, value: orNotShared(firstName(claims)) },
    { key: 'family_name', label: copy.dashboard.identity.familyName, value: orNotShared(lastName(claims)) },
    { key: 'email', label: copy.dashboard.identity.email, value: orNotShared(email(claims)) },
    {
      key: 'age_over_18',
      label: copy.dashboard.identity.age,
      value:
        adult === undefined ? (
          orNotShared(undefined)
        ) : adult ? (
          <Badge variant="success">{copy.dashboard.identity.verifiedAdult}</Badge>
        ) : (
          <Badge>{copy.dashboard.identity.notVerifiedAdult}</Badge>
        ),
    },
  ]

  const session: KeyValueItem[] = [
    { key: 'provider', label: copy.dashboard.session.provider, value: providerLabel },
    {
      key: 'amr',
      label: copy.dashboard.session.authentication,
      value: amr.length
        ? amr.map((code) => (
            <Badge key={code} variant={code === 'vc' ? 'success' : 'neutral'}>
              {copy.amr[code] ?? code}
            </Badge>
          ))
        : copy.common.none,
    },
    { key: 'sub', label: copy.dashboard.session.subject, value: <code className={styles.code}>{subject(claims) ?? copy.common.none}</code> },
    { key: 'auth_time', label: copy.dashboard.session.signedInAt, value: formatTimestamp(claim(claims, 'auth_time')) ?? copy.common.none },
    { key: 'exp', label: copy.dashboard.session.expires, value: formatTimestamp(claim(claims, 'exp')) ?? copy.common.none },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{copy.dashboard.greeting(firstName(claims))}</h1>
        <p className={styles.subtitle}>
          {wallet ? copy.dashboard.signedInWithWallet(providerLabel) : copy.dashboard.signedInVia(providerLabel)}
        </p>
      </header>

      <Card title={copy.dashboard.identity.title}>
        <KeyValueList items={identity} />
      </Card>

      <Card title={copy.dashboard.session.title}>
        <KeyValueList items={session} />
      </Card>

      <details className={styles.developer}>
        <summary>{copy.dashboard.developer.summary}</summary>
        <pre>{JSON.stringify(claims, null, 2)}</pre>
      </details>
    </div>
  )
}

export default DashboardPage
