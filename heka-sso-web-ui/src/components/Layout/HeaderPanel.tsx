import styles from './Layout.module.scss'

interface HeaderPanelProps {
  title: string
  eyebrow?: string
}

const ILLUSTRATION_URL = '/illustrations/civictrust.webp'

function TitleBlock({ title, eyebrow }: HeaderPanelProps) {
  return (
    <div className={styles.titleBlock}>
      {eyebrow && <p className={styles.headerEyebrow}>{eyebrow}</p>}
      <h1 className={styles.headerTitle}>{title}</h1>
    </div>
  )
}

export function HeaderPanel({ title, eyebrow }: HeaderPanelProps) {
  return (
    <aside className={styles.headerPanel}>
      <TitleBlock title={title} eyebrow={eyebrow} />
      <img className={styles.headerIllustration} src={ILLUSTRATION_URL} alt="" decoding="async" />
    </aside>
  )
}

export function TopPanel({ title, eyebrow }: HeaderPanelProps) {
  return (
    <div className={styles.topPanel}>
      <TitleBlock title={title} eyebrow={eyebrow} />
      <img className={styles.topPanelIllustration} src={ILLUSTRATION_URL} alt="" decoding="async" />
    </div>
  )
}
