import { Button as AriaButton } from 'react-aria-components'

import { copy } from '@/copy'

import styles from './Logo.module.scss'

interface LogoProps {
  /** When set, the logo is a button (identity-service: navigates home). */
  onPress?: () => void
}

// Layout of identity-service's `Logo` and Figma's "Logo block": brand mark +
// wordmark. The mark is the CivicTrust raster (public/civic-trust.webp —
// cropped, 96px tall, preloaded from index.html); decorative next to the
// wordmark text, so alt="".
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
