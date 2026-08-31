import { classNames } from '@/utils/classNames'

import styles from './Layout.module.scss'

export type Illustration = 'wallet' | 'wallets'

interface HeaderPanelProps {
  title: string
  illustration?: Illustration
}

// Illustrations are raster exports of the Figma 3D renders (identity-service's
// `wallet.png`, `many-wallets.png`), cropped to their opaque content and saved
// as WebP in `public/illustrations/` — a stable URL so index.html can preload
// them (no pop-in on first paint). Decorative, so alt="". Per-illustration
// placement lives in the matching `illustration-*` class.
const illustrationUrls: Record<Illustration, string> = {
  wallet: '/illustrations/wallet.webp',
  wallets: '/illustrations/many-wallets.webp',
}

/** Desktop: the 288px header column of the Figma body (identity-service `BasicPanel`). */
export function HeaderPanel({ title, illustration }: HeaderPanelProps) {
  return (
    <aside className={styles.headerPanel}>
      <h1 className={styles.headerTitle}>{title}</h1>
      {illustration && (
        <img
          className={classNames(styles.headerIllustration, {}, [styles[`illustration-${illustration}`]])}
          src={illustrationUrls[illustration]}
          alt=""
          decoding="async"
        />
      )}
    </aside>
  )
}

/** Stacked shell: title row with a small illustration (identity-service `TopPanel`). */
export function TopPanel({ title, illustration }: HeaderPanelProps) {
  return (
    <div className={styles.topPanel}>
      <h1>{title}</h1>
      {illustration && (
        <img className={styles.topPanelIllustration} src={illustrationUrls[illustration]} alt="" decoding="async" />
      )}
    </div>
  )
}
