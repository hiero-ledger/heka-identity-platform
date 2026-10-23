import { useServices } from '@bifold/core'
import { useNavigation } from '@react-navigation/core'
import { renderHook } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'
import { useWalletSettings } from '../../src/utils/useWalletSettings'

const mockParentNavigate = jest.fn()

// @bifold/core is mocked globally without the enums and hooks this hook uses
jest.mock('@bifold/core', () => ({
  Screens: { TogglePushNotifications: 'Toggle Push Notifications', PushNotifications: 'Push Notifications' },
  Stacks: { SettingStack: 'Settings Stack', ContactStack: 'Contacts Stack' },
  ToastType: { Success: 'success', Error: 'error' },
  TOKENS: { CONFIG: 'config' },
  useServices: jest.fn(),
  useStore: jest.fn(() => [{ preferences: { useBiometry: false, developerModeEnabled: false } }]),
}))
jest.mock('@heka-wallet/shared', () => ({
  exportLogs: jest.fn(),
  useHekaTheme: jest.fn(() => ({ ColorPalette: { brand: { primary: '#000' } } })),
}))
jest.mock('@react-navigation/core', () => ({ useNavigation: jest.fn() }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { t: (key: string) => key, language: 'en' } }),
}))
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }))
jest.mock('../../src/config', () => ({ isExternalAuthEnabled: false, isWalletBackupEnabled: false }))
jest.mock('../../src/contexts', () => ({ useRootStore: () => ({ oauthStore: {}, passkeysStore: {} }) }))
jest.mock('../../src/utils/useWalletBackupHelpers', () => ({
  useWalletBackupHelpers: () => ({ backupWallet: jest.fn() }),
}))

function renderSettings(enablePushNotifications?: object) {
  mockFunction(useServices).mockReturnValue([{ enablePushNotifications }] as unknown as ReturnType<typeof useServices>)
  mockFunction(useNavigation).mockReturnValue({
    navigate: jest.fn(),
    getParent: () => ({ navigate: mockParentNavigate }),
  })
  return renderHook(() => useWalletSettings()).result.current
}

const findNotificationsSetting = (sections: ReturnType<typeof useWalletSettings>) =>
  sections.flatMap((section) => section.data).find((setting) => setting.title === 'Settings.Notifications')

describe('useWalletSettings — notifications', () => {
  it('opens the push toggle screen that Bifold registers in its settings stack', () => {
    const notifications = findNotificationsSetting(
      renderSettings({ status: jest.fn(), setup: jest.fn(), toggle: jest.fn() })
    )

    notifications?.onPress?.()

    expect(mockParentNavigate).toHaveBeenCalledWith('Settings Stack', { screen: 'Toggle Push Notifications' })
  })

  it('has no notifications entry when push notifications are not configured', () => {
    expect(findNotificationsSetting(renderSettings(undefined))).toBeUndefined()
  })
})
