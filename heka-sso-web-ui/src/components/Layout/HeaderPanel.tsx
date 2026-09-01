import styles from './Layout.module.scss'

interface HeaderPanelProps {
  title: string
  /** Small uppercase label above the title. */
  eyebrow?: string
}

// The header-column illustration (Figma "Issue credential": artwork anchored
// bottom-left, overflowing the column and clipped by it). Asset:
// public/illustrations/civictrust.webp — the CivicTrust render with its
// background removed, preloaded from index.html. Decorative, so alt="".
const ILLUSTRATION_URL = '/illustrations/civictrust.webp'

/** Title block: eyebrow, headline, gradient accent bar. */
function TitleBlock({ title, eyebrow }: HeaderPanelProps) {
  return (
    <div className={styles.titleBlock}>
      {eyebrow && <p className={styles.headerEyebrow}>{eyebrow}</p>}
      <h1 className={styles.headerTitle}>{title}</h1>
    </div>
  )
}

/** Desktop: the 288px header column of the Figma body (identity-service `BasicPanel`). */
export function HeaderPanel({ title, eyebrow }: HeaderPanelProps) {
  return (
    <aside className={styles.headerPanel}>
      <TitleBlock title={title} eyebrow={eyebrow} />
      <img className={styles.headerIllustration} src={ILLUSTRATION_URL} alt="" decoding="async" />
    </aside>
  )
}

/** Stacked shell: title row with a small illustration (identity-service `TopPanel`). */
export function TopPanel({ title, eyebrow }: HeaderPanelProps) {
  return (
    <div className={styles.topPanel}>
      <TitleBlock title={title} eyebrow={eyebrow} />
      <img className={styles.topPanelIllustration} src={ILLUSTRATION_URL} alt="" decoding="async" />
    </div>
  )
}
