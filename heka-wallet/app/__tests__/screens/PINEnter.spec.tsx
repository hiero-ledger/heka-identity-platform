// Covers: #44 — PINEnter screen unit tests
import React from 'react'
import { View, Text } from 'react-native'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'

const mockDispatch = jest.fn()
const mockNavigate = jest.fn()
const mockNavigationDispatch = jest.fn()
const mockCheckPIN = jest.fn()
const mockGetWalletCredentials = jest.fn()
const mockIsBiometricsActive = jest.fn()
const mockDisableBiometrics = jest.fn()

jest.mock('@hyperledger/aries-bifold-core', () => ({
  useAuth: jest.fn(),
  useStore: jest.fn(),
  useServices: jest.fn(),
  Button: ({ title, onPress, accessibilityLabel }: any) =>
    React.createElement(Text, { testID: `button-${accessibilityLabel ?? title}`, onPress }, title),
  ButtonType: { Primary: 'Primary', Secondary: 'Secondary' },
  DispatchAction: {
    ATTEMPT_UPDATED: 'ATTEMPT_UPDATED',
    LOCKOUT_UPDATED: 'LOCKOUT_UPDATED',
    USE_BIOMETRY: 'USE_BIOMETRY',
  },
  EventTypes: {
    ERROR_ADDED: 'error-added',
    BIOMETRY_ERROR: 'biometry-error',
  },
  Screens: { AttemptLockout: 'AttemptLockout' },
  TOKENS: { UTIL_LOGGER: 'UTIL_LOGGER', CONFIG: 'CONFIG' },
  BifoldError: class BifoldError extends Error {
    public constructor(
      public title: string,
      public message: string,
      public description: string,
      public code: number,
    ) {
      super(message)
    }
  },
}))

jest.mock('@heka-wallet/shared', () => ({
  useHekaTheme: jest.fn(),
}))

jest.mock('@hyperledger/aries-bifold-core/App/constants', () => ({
  attemptLockoutBaseRules: {},
  attemptLockoutThresholdRules: { attemptThreshold: 5, attemptIncrement: 5, attemptPenalty: 60000 },
  minPINLength: 6,
}))

jest.mock('@hyperledger/aries-bifold-core/App/utils/crypto', () => ({
  hashPIN: jest.fn(),
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
  CommonActions: { reset: (x: unknown) => x },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('../../src/components/misc/PinKeyPad', () => ({ onPinEntered }: any) =>
  React.createElement(Text, {
    testID: 'pin-keypad',
    onPress: () => onPinEntered('123456'),
  }),
)

jest.mock('../../src/components/modals', () => ({
  AlertModal: ({ visible, title, onCancel }: any) =>
    visible
      ? React.createElement(Text, { testID: 'alert-modal', onPress: onCancel }, title)
      : null,
}))

jest.mock('../../src/components/views/LoadingView', () => ({
  Loader: () => React.createElement(View, { testID: 'loader' }),
}))

import { useAuth, useStore, useServices } from '@hyperledger/aries-bifold-core'
import { useHekaTheme } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import { hashPIN } from '@hyperledger/aries-bifold-core/App/utils/crypto'

const mockUseAuth = mockFunction(useAuth as jest.Mock)
const mockUseStore = mockFunction(useStore as jest.Mock)
const mockUseServices = mockFunction(useServices as jest.Mock)
const mockUseHekaTheme = mockFunction(useHekaTheme as jest.Mock)
const mockUseNavigation = mockFunction(useNavigation as jest.Mock)
const mockHashPIN = mockFunction(hashPIN as jest.Mock)

import PINEnter, { PINEntryUsage } from '../../src/screens/PINEnter'

const mockTheme = {
  TextTheme: { headingFour: {}, normal: {} },
  ColorPallet: {
    brand: { primary: '#000', primaryBackground: '#fff', primaryDisabled: '#ccc' },
    grayscale: { lightGrey: '#eee', mediumGrey: '#999' },
  },
  Spacing: { lg: 16, md: 8, sm: 4, xxl: 32, xxxl: 48, xl: 24 },
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    preferences: { useBiometry: false },
    loginAttempt: { loginAttempts: 0, lockoutDate: 0, servedPenalty: false },
    onboarding: { postAuthScreens: [] },
    lockout: { displayNotification: false },
    ...overrides,
  }
}

describe('PINEnter', () => {
  const mockSetAuthenticated = jest.fn()

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      checkPIN: mockCheckPIN,
      getWalletCredentials: mockGetWalletCredentials,
      isBiometricsActive: mockIsBiometricsActive,
      disableBiometrics: mockDisableBiometrics,
    })
    mockUseStore.mockReturnValue([makeStore(), mockDispatch])
    mockUseServices.mockReturnValue([{ verbose: jest.fn(), error: jest.fn() }])
    mockUseHekaTheme.mockReturnValue(mockTheme)
    mockUseNavigation.mockReturnValue({ navigate: mockNavigate, dispatch: mockNavigationDispatch })
    mockIsBiometricsActive.mockResolvedValue(false)
    mockGetWalletCredentials.mockResolvedValue(null)
  })

  // Covers: #44 — component renders PinKeyPad
  it('renders PinKeyPad', () => {
    const { getByTestId } = render(
      <PINEnter setAuthenticated={mockSetAuthenticated} />,
    )
    expect(getByTestId('pin-keypad')).toBeTruthy()
  })

  // Covers: #44 — shows EnterPIN title by default
  it('renders EnterPIN title when no lockout or biometry issue', () => {
    const { getByText } = render(
      <PINEnter setAuthenticated={mockSetAuthenticated} />,
    )
    expect(getByText('PINEnter.EnterPIN')).toBeTruthy()
  })

  // Covers: #44 — biometry unlock button visible when useBiometry + WalletUnlock
  it('shows biometry unlock button when biometry enabled and usage is WalletUnlock', () => {
    mockUseStore.mockReturnValue([makeStore({ preferences: { useBiometry: true } }), mockDispatch])

    const { getByTestId } = render(
      <PINEnter setAuthenticated={mockSetAuthenticated} usage={PINEntryUsage.WalletUnlock} />,
    )

    expect(getByTestId('button-PINEnter.BiometricsUnlock')).toBeTruthy()
  })

  // Covers: #44 — biometry button hidden in PINCheck usage
  it('does not show biometry unlock button in PINCheck mode', () => {
    mockUseStore.mockReturnValue([makeStore({ preferences: { useBiometry: true } }), mockDispatch])

    const { queryByTestId } = render(
      <PINEnter setAuthenticated={mockSetAuthenticated} usage={PINEntryUsage.PINCheck} />,
    )

    expect(queryByTestId('button-PINEnter.BiometricsUnlock')).toBeNull()
  })

  // Covers: #44 — correct PIN calls setAuthenticated(true) in WalletUnlock mode
  it('calls setAuthenticated(true) on correct PIN submission', async () => {
    mockCheckPIN.mockResolvedValue(true)
    mockUseStore.mockReturnValue([
      makeStore({ loginAttempt: { loginAttempts: 0, lockoutDate: 0, servedPenalty: false } }),
      mockDispatch,
    ])

    const { getByTestId } = render(
      <PINEnter setAuthenticated={mockSetAuthenticated} usage={PINEntryUsage.WalletUnlock} />,
    )

    await act(async () => {
      fireEvent.press(getByTestId('pin-keypad'))
    })

    await waitFor(() => expect(mockSetAuthenticated).toHaveBeenCalledWith(true))
  })

  // Covers: #44 — incorrect PIN dispatches ATTEMPT_UPDATED with incremented count
  it('dispatches ATTEMPT_UPDATED on incorrect PIN', async () => {
    mockCheckPIN.mockResolvedValue(false)

    const { getByTestId } = render(
      <PINEnter setAuthenticated={mockSetAuthenticated} usage={PINEntryUsage.WalletUnlock} />,
    )

    await act(async () => {
      fireEvent.press(getByTestId('pin-keypad'))
    })

    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ATTEMPT_UPDATED',
          payload: [expect.objectContaining({ loginAttempts: 1 })],
        }),
      ),
    )
  })

  // Covers: #44 — alert modal shown on wrong PIN
  it('shows AlertModal on wrong PIN when no lockout applies', async () => {
    mockCheckPIN.mockResolvedValue(false)

    const { getByTestId, findByTestId } = render(
      <PINEnter setAuthenticated={mockSetAuthenticated} usage={PINEntryUsage.WalletUnlock} />,
    )

    await act(async () => {
      fireEvent.press(getByTestId('pin-keypad'))
    })

    expect(await findByTestId('alert-modal')).toBeTruthy()
  })

  // Covers: #44 — lockout notification shows re-enter text
  it('shows re-enter PIN text when lockout notification is active', () => {
    mockUseStore.mockReturnValue([
      makeStore({ lockout: { displayNotification: true } }),
      mockDispatch,
    ])

    const { getByText } = render(
      <PINEnter setAuthenticated={mockSetAuthenticated} />,
    )

    expect(getByText('PINEnter.ReEnterPIN')).toBeTruthy()
  })
})
