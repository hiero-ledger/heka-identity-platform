import WalletIllustration from '@/assets/icons/wallet-new.svg?react'

import styles from './Layout.module.scss'

export type Illustration = 'wallet'

interface HeaderPanelProps {
  title: string
  illustration?: Illustration
}

const illustrations = {
  wallet: WalletIllustration,
} as const

/** Desktop: the 288px header column of the Figma body (identity-service `BasicPanel`). */
export function HeaderPanel({ title, illustration }: HeaderPanelProps) {
  const Illustration = illustration ? illustrations[illustration] : undefined
  return (
    <aside className={styles.headerPanel}>
      <h1 className={styles.headerTitle}>{title}</h1>
      {Illustration && <Illustration className={styles.headerIllustration} aria-hidden="true" />}
    </aside>
  )
}

/** Stacked shell: title row with a small illustration (identity-service `TopPanel`). */
export function TopPanel({ title, illustration }: HeaderPanelProps) {
  const Illustration = illustration ? illustrations[illustration] : undefined
  return (
    <div className={styles.topPanel}>
      <h1>{title}</h1>
      {Illustration && <Illustration className={styles.topPanelIllustration} aria-hidden="true" />}
    </div>
  )
}
