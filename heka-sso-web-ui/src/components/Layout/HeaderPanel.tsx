import walletImage from '@/assets/wallet.webp'

import styles from './Layout.module.scss'

export type Illustration = 'wallet'

interface HeaderPanelProps {
  title: string
  illustration?: Illustration
}

// Illustrations are raster exports (identity-service's `public/wallet.png`, cropped to its
// opaque content and saved as WebP — the 3D wallet of the Figma "Sign in" header); decorative, so alt="".
const illustrations: Record<Illustration, string> = {
  wallet: walletImage,
}

/** Desktop: the 288px header column of the Figma body (identity-service `BasicPanel`). */
export function HeaderPanel({ title, illustration }: HeaderPanelProps) {
  return (
    <aside className={styles.headerPanel}>
      <h1 className={styles.headerTitle}>{title}</h1>
      {illustration && <img className={styles.headerIllustration} src={illustrations[illustration]} alt="" />}
    </aside>
  )
}

/** Stacked shell: title row with a small illustration (identity-service `TopPanel`). */
export function TopPanel({ title, illustration }: HeaderPanelProps) {
  return (
    <div className={styles.topPanel}>
      <h1>{title}</h1>
      {illustration && <img className={styles.topPanelIllustration} src={illustrations[illustration]} alt="" />}
    </div>
  )
}
