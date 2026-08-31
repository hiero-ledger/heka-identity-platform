import { ReactNode } from 'react'

import DashboardIcon from '@/assets/icons/dashboard-outline.svg?react'
import UserIcon from '@/assets/icons/user.svg?react'
import { copy } from '@/copy'
import { classNames } from '@/utils/classNames'
import { useVisualViewportHeight } from '@/utils/useVisualViewportHeight'
import Button from '@/components/Button/Button'
import Logo from '@/components/Logo/Logo'
import { useDesktop } from '@/components/Screen/useMediaQuery'

import styles from './Layout.module.scss'

interface AppLayoutProps {
  userName?: string
  onSignOut: () => void
  children: ReactNode
}

/**
 * Authenticated shell (UI-PLAN.md §2.2 / §2.4): sidebar + white body on
 * desktop; logo/sign-out top row + body when stacked. One page, so the nav
 * has a single, always-active item.
 */
function AppLayout({ userName, onSignOut, children }: AppLayoutProps) {
  useVisualViewportHeight()
  const isDesktop = useDesktop()

  return (
    <div className={classNames(styles.shell, {}, [styles.appShell])}>
      {isDesktop ? (
        <aside className={styles.sidebar}>
          <Logo />
          <nav className={styles.sidebarNav} aria-label="Main">
            <span className={classNames(styles.navItem, { [styles.navItemActive]: true })} aria-current="page">
              <DashboardIcon className={styles.navIcon} aria-hidden="true" />
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
            <Button buttonType="text" leftIcon="logout" alignment="left" onPress={onSignOut}>
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
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  )
}

export default AppLayout
