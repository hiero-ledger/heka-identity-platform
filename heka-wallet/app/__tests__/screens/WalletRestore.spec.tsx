import { render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import Toast from 'react-native-toast-message'

import { WalletRestore } from '../../src/screens/WalletRestore'

const mockGetUser = jest.fn()
const mockTryDownloadRemoteBackup = jest.fn()
// Replaced per test; the screen reads isAuthenticated on every render.
let mockPasskeysStore = { isAuthenticated: true, getUser: () => mockGetUser() }

jest.mock('@bifold/core', () => {
  const { Text } = jest.requireActual('react-native')
  const store = [{}, jest.fn()]
  return {
    Button: ({ title, disabled }: { title: string; disabled?: boolean }) => (
      <Text accessibilityState={{ disabled }}>{title}</Text>
    ),
    ButtonType: { Primary: 'Primary', Secondary: 'Secondary' },
    DispatchAction: {},
    Screens: { Onboarding: 'Onboarding', Terms: 'Terms' },
    ToastType: { Error: 'error' },
    useStore: () => store,
  }
})

jest.mock('@heka-wallet/shared', () => {
  const theme = {
    TextTheme: { normal: {} },
    Spacing: {},
    ColorPalette: { brand: {}, semantic: { error: 'red' } },
  }
  const { GlobalLogger } = jest.requireActual('../../../jest-helpers/__mocks__/logger').default
  return { GlobalLogger, useHekaTheme: () => theme }
})

jest.mock('@react-navigation/core', () => {
  const navigation = { navigate: jest.fn() }
  return { useNavigation: () => navigation }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }))

jest.mock('../../src/components/misc', () => ({ HieroLogo: () => null }))

jest.mock('../../src/components/modals', () => {
  const { Text } = jest.requireActual('react-native')
  const modal = { isVisible: false, show: jest.fn(), hide: jest.fn() }
  return {
    LoadingModal: () => <Text>loading</Text>,
    PasskeysAuthModal: () => null,
    usePasskeysAuthModal: () => modal,
  }
})

jest.mock('../../src/components/views/LoadingView', () => ({ Loader: () => null }))

jest.mock('../../src/contexts', () => ({ useRootStore: () => ({ passkeysStore: mockPasskeysStore }) }))

jest.mock('../../src/navigators/types', () => ({ Stacks: { BifoldStack: 'BifoldStack' } }))

jest.mock('../../src/utils/useWalletBackupHelpers', () => {
  const helpers = {
    tryDownloadRemoteBackup: (user: string) => mockTryDownloadRemoteBackup(user),
    restoreWallet: jest.fn(),
  }
  return { useWalletBackupHelpers: () => helpers }
})

const expectErrorToast = (message: string) =>
  expect(Toast.show).toBeCalledWith(expect.objectContaining({ type: 'error', text2: message }))

describe('WalletRestore', () => {
  beforeEach(() => {
    mockPasskeysStore = { isAuthenticated: true, getUser: () => mockGetUser() }
    mockGetUser.mockResolvedValue('user')
  })

  it('stops loading and shows the error when the passkey user cannot be read', async () => {
    mockGetUser.mockRejectedValue(new Error('Keychain unavailable'))

    render(<WalletRestore />)

    await waitFor(() => expect(screen.queryByText('loading')).toBeNull())
    expectErrorToast('Keychain unavailable')
    expect(mockTryDownloadRemoteBackup).not.toBeCalled()
  })

  it('offers restore when the backup is downloaded', async () => {
    mockTryDownloadRemoteBackup.mockResolvedValue(true)

    render(<WalletRestore />)

    await waitFor(() => expect(screen.getByText('WalletBackup.RestoreWallet')).toBeEnabled())
    expect(screen.getByText('WalletBackup.BackupIsAvailable')).toBeTruthy()
  })

  it('stops offering restore when a later download fails', async () => {
    mockTryDownloadRemoteBackup.mockResolvedValue(true)
    const { rerender } = render(<WalletRestore />)
    await waitFor(() => expect(screen.getByText('WalletBackup.RestoreWallet')).toBeEnabled())

    // Passkey authentication lapses and comes back, which downloads the backup again.
    mockPasskeysStore = { ...mockPasskeysStore, isAuthenticated: false }
    rerender(<WalletRestore />)
    mockTryDownloadRemoteBackup.mockRejectedValue(new Error('Wallet backup download failed with status code: 500'))
    mockPasskeysStore = { ...mockPasskeysStore, isAuthenticated: true }
    rerender(<WalletRestore />)

    await waitFor(() => expectErrorToast('Wallet backup download failed with status code: 500'))
    expect(screen.getByText('WalletBackup.RestoreWallet')).toBeDisabled()
    expect(screen.getByText('WalletBackup.BackupIsNotAvailable')).toBeTruthy()
  })
})
