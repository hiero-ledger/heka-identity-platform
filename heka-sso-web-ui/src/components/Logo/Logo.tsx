import { Button as AriaButton } from 'react-aria-components'

import LogoMark from '@/assets/logo-mark.svg?react'
import { copy } from '@/copy'

import styles from './Logo.module.scss'

interface LogoProps {
  /** When set, the logo is a button (identity-service: navigates home). */
  onPress?: () => void
}

// Layout of identity-service's `Logo` and Figma's "Logo block" (24 px app
// icon + wordmark). The mark is a placeholder until the brand asset is
// exported from Figma; the wordmark is text for now.
function Logo({ onPress }: LogoProps) {
  const content = (
    <>
      <LogoMark className={styles.mark} aria-hidden="true" />
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
