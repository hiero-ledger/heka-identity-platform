import { ReactNode } from 'react'

import { useVisualViewportHeight } from '../../lib/useVisualViewportHeight'
import Logo from '../Logo/Logo'
import { useDesktop } from '../Screen/useMediaQuery'

import { HeaderPanel, Illustration, TopPanel } from './HeaderPanel'
import styles from './Layout.module.scss'

interface AuthLayoutProps {
  title: string
  illustration?: Illustration
  /** Optional right-hand content of the top "Block" row (e.g. a back action). */
  topAction?: ReactNode
  children: ReactNode
}

/**
 * Unauthenticated shell (Figma "Sign in", identity-service
 * `UnauthenticatedLayout`): white body with the header column on desktop, or
 * the top panel when stacked; the content column carries the logo row and
 * the page body.
 */
function AuthLayout({ title, illustration, topAction, children }: AuthLayoutProps) {
  useVisualViewportHeight()
  const isDesktop = useDesktop()

  return (
    <div className={styles.shell}>
      <main className={styles.body}>
        {isDesktop && <HeaderPanel title={title} illustration={illustration} />}
        <div className={styles.content}>
          <div className={styles.contentTop}>
            <Logo />
            {topAction}
          </div>
          {!isDesktop && <TopPanel title={title} illustration={illustration} />}
          <div className={styles.contentBody}>{children}</div>
        </div>
      </main>
    </div>
  )
}

export default AuthLayout
