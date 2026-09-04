import { Button as AriaButton } from 'react-aria-components'

import { copy } from '@/copy'

import styles from './Logo.module.scss'

interface LogoProps {
  onPress?: () => void
}

function Logo({ onPress }: LogoProps) {
  const content = (
    <>
      <img className={styles.mark} src="/civic-trust.webp" alt="" decoding="async" />
      <span className={styles.wordmark}>{copy.app.name}</span>
    </>
  )
  if (!onPress) {
    return <span className={styles.Logo}>{content}</span>
  }
  return (
    <AriaButton className={styles.Logo} onPress={onPress} aria-label={copy.app.name}>
      {content}
    </AriaButton>
  )
}

export default Logo
