import { useHekaTheme } from '@heka-wallet/shared'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import { useContext } from 'react'

// Bottom space a scrollable screen needs so its last item can scroll fully above the tab bar.
// The tab bar floats over the screens (TabTheme.tabBarStyle is absolutely positioned and lifted by its bottom margin),
// so the navigator does not shrink the screen for it. The bottom safe-area inset is not added: TabStack wraps the
// navigator in a SafeAreaView, so the screens and the bar already end above the home indicator.
// Returns 0 outside the tab navigator (e.g. the same screen opened from the root NotificationStack).
export const useFloatingTabBarInset = (): number => {
  const tabBarHeight = useContext(BottomTabBarHeightContext)
  const { TabTheme, Spacing } = useHekaTheme()

  if (!tabBarHeight) return 0

  const { marginBottom } = TabTheme.tabBarStyle
  return tabBarHeight + (typeof marginBottom === 'number' ? marginBottom : 0) + Spacing.md
}
