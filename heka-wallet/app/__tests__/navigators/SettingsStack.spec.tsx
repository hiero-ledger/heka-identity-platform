import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Pressable } from 'react-native'
import Toast from 'react-native-toast-message'

import { SettingsStack } from '../../src/navigators/SettingsStack'

type ScreenOptions = { headerRight?: () => React.ReactNode }

const mockCalls: string[] = []
const mockLockWallet = jest.fn(() => {
  mockCalls.push('lockWallet')
})
const mockLogOut = jest.fn(() => {
  mockCalls.push('logOut')
  return Promise.resolve()
})
const mockIconButton = ({ onPress, testID }: { onPress: () => void; testID: string }) => (
  <Pressable onPress={onPress} testID={testID} />
)

jest.mock('@bifold/core', () => ({
  __esModule: true,
  ButtonLocation: { Right: 'right' },
  ToastType: { Error: 'error' },
  IconButton: (props: { onPress: () => void; testID: string }) => mockIconButton(props),
  useDefaultStackOptions: () => ({}),
}))

jest.mock('@heka-wallet/shared', () => ({ useHekaTheme: () => ({}) }))

// Renders only the header button; the real navigator needs a NavigationContainer and native modules.
jest.mock('@react-navigation/stack', () => ({
  createStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: ({ options }: { options: ScreenOptions }) => options.headerRight?.() ?? null,
  }),
}))

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('../../src/config', () => ({ isExternalAuthEnabled: true }))
jest.mock('../../src/contexts', () => ({ useRootStore: () => ({ oauthStore: { logOut: mockLogOut } }) }))
jest.mock('../../src/screens', () => ({ UserProfile: () => null }))
jest.mock('../../src/utils/useWalletAuthHelpers', () => ({
  useWalletAuthHelpers: () => ({ lockWallet: mockLockWallet }),
}))

describe('SettingsStack log out', () => {
  beforeEach(() => {
    mockCalls.length = 0
    jest.clearAllMocks()
  })

  // Logging out unmounts BifoldStack; the wallet must be locked while it is still mounted to shut the agent down
  it('locks the wallet before logging out', async () => {
    render(<SettingsStack />)

    fireEvent.press(screen.getByTestId('Log Out'))

    await waitFor(() => expect(mockLogOut).toHaveBeenCalled())
    expect(mockCalls).toEqual(['lockWallet', 'logOut'])
  })

  it('shows an error when logging out fails', async () => {
    mockLogOut.mockRejectedValueOnce(new Error('logout failed'))

    render(<SettingsStack />)

    fireEvent.press(screen.getByTestId('Log Out'))

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Error.Problem', text2: 'logout failed' })
      )
    )
  })
})
