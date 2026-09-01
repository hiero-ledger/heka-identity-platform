import { ReactNode } from 'react'

import DashboardIcon from '@/assets/icons/dashboard-outline.svg?react'
import UserIcon from '@/assets/icons/user.svg?react'
import Button from '@/components/Button/Button'
import Logo from '@/components/Logo/Logo'
import { useDesktop } from '@/components/Screen/useMediaQuery'
import { copy } from '@/copy'
import { classNames } from '@/utils/classNames'
import { useVisualViewportHeight } from '@/utils/useVisualViewportHeight'

import { HeaderPanel, TopPanel } from './HeaderPanel'
import styles from './Layout.module.scss'

interface AppLayoutProps {
  /** Page title shown in the header column (stacked: the top panel). */
  title: string
  userName?: string
  onSignOut: () => void
  children: ReactNode
}

/**
 * Authenticated shell (UI-PLAN.md §2.2 / §2.4, Figma "Issue credential"):
 * sidebar (logo, nav, user, sign out) + white body holding the header column
 * and the centered page content; logo/sign-out top row + top panel + content
 * when stacked. One page, so the nav has a single, always-active item.
 */
function AppLayout({ title, userName, onSignOut, children }: AppLayoutProps) {
  useVisualViewportHeight()
  const isDesktop = useDesktop()

  return (
    <div className={classNames(styles.shell, {}, [styles.appShell])}>
      {isDesktop ? (
        <aside className={styles.sidebar}>
          <Logo />
          <nav className={styles.sidebarNav} aria-label="Main">
            <span className={classNames(styles.navItem, { [styles.navItemActive]: true })} aria-current="page">
              <DashboardIcon className={classNames(styles.navIcon, {}, [styles.navItemIcon])} aria-hidden="true" />
              {copy.nav.dashboard}
            </span>
          </nav>
          <div className={styles.sidebarFooter}>
            {userName && (
              <div className={styles.navItem} title={userName}>
                <UserIcon className={styles.navIcon} aria-hidden="true" />
                <span className={styles.userName}>{userName}</span>
              </div>
            )}
            <Button buttonType="outlined" fullWidth onPress={onSignOut}>
              {copy.nav.signOut}
            </Button>
          </div>
        </aside>
      ) : (
        <header className={styles.topRow}>
          <Logo />
          <Button buttonType="text" rightIcon="logout" onPress={onSignOut}>
            {copy.nav.signOut}
          </Button>
        </header>
      )}
      <main className={styles.body}>
        {isDesktop && <HeaderPanel title={title} eyebrow={copy.eyebrow.dashboard} />}
        <div className={styles.content}>
          {!isDesktop && <TopPanel title={title} eyebrow={copy.eyebrow.dashboard} />}
          <div className={styles.contentBody}>{children}</div>
        </div>
      </main>
    </div>
  )
}

export default AppLayout
