// Covers: #44 — UseBiometry screen unit tests
import React from 'react'
import { View, Text } from 'react-native'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'

const mockDispatch = jest.fn()
const mockNavigationDispatch = jest.fn()
const mockCommitPIN = jest.fn()
const mockDisableBiometrics = jest.fn()
const mockIsBiometricsActive = jest.fn()

jest.mock('@hyperledger/aries-bifold-core', () => ({
  useStore: jest.fn(),
  useServices: jest.fn(),
  useAuth: jest.fn(),
  Button: ({ title, onPress, accessibilityLabel }: any) =>
    React.createElement(Text, {
      testID: `button-${accessibilityLabel ?? title}`,
      onPress,
    }, title),
  ButtonType: { Primary: 'Primary', Secondary: 'Secondary' },
  DispatchAction: {
    USE_BIOMETRY: 'USE_BIOMETRY',
    DID_COMPLETE_ONBOARDING: 'DID_COMPLETE_ONBOARDING',
  },
  EventTypes: { BIOMETRY_UPDATE: 'biometry-update' },
  Screens: { UsePushNotifications: 'UsePushNotifications' },
  TOKENS: { CONFIG: 'CONFIG' },
  OnboardingStackParams: {},
}))

jest.mock('@heka-wallet/shared', () => ({
  useHekaTheme: jest.fn(),
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
  CommonActions: { reset: (x: unknown) => x },
}))

jest.mock('@react-navigation/stack', () => ({
  StackNavigationProp: jest.fn(),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, edges }: any) => React.createElement(View, null, children),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('../../src/assets/fingerprint.svg', () => () =>
  React.createElement(View, { testID: 'fingerprint-image' }),
)

jest.mock('../../src/components/modals', () => ({
  AlertModal: ({ visible, title, onAccept, onCancel }: any) =>
    visible
      ? React.createElement(View, { testID: 'settings-popup' })
      : null,
}))

jest.mock('../../src/components/views/LoadingView', () => ({
  Loader: () => React.createElement(View, { testID: 'loader' }),
}))

jest.mock('../../src/screens/PINEnter', () => ({
  __esModule: true,
  default: () => React.createElement(View, { testID: 'pin-enter-modal' }),
  PINEntryUsage: { PINCheck: 'PINCheck', WalletUnlock: 'WalletUnlock' },
}))

import { useStore, useServices, useAuth } from '@hyperledger/aries-bifold-core'
import { useHekaTheme } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import UseBiometry from '../../src/screens/UseBiometry'

const mockUseStore = mockFunction(useStore as jest.Mock)
const mockUseServices = mockFunction(useServices as jest.Mock)
const mockUseAuth = mockFunction(useAuth as jest.Mock)
const mockUseHekaTheme = mockFunction(useHekaTheme as jest.Mock)
const mockUseNavigation = mockFunction(useNavigation as jest.Mock)

const mockTheme = {
  TextTheme: { headingFour: {}, normal: {} },
  ColorPallet: {
    brand: { primary: '#000', primaryBackground: '#fff', primaryDisabled: '#ccc' },
    grayscale: { lightGrey: '#eee', mediumGrey: '#999' },
  },
  Spacing: { lg: 16, md: 8, xxl: 32, xxxl: 48 },
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    preferences: { useBiometry: false },
    onboarding: { didCompleteOnboarding: false },
    ...overrides,
  }
}

describe('UseBiometry', () => {
  beforeEach(() => {
    mockUseStore.mockReturnValue([makeStore(), mockDispatch])
    mockUseServices.mockReturnValue([{ enablePushNotifications: false }])
    mockUseAuth.mockReturnValue({
      isBiometricsActive: mockIsBiometricsActive,
      commitPIN: mockCommitPIN,
      disableBiometrics: mockDisableBiometrics,
    })
    mockUseHekaTheme.mockReturnValue(mockTheme)
    mockUseNavigation.mockReturnValue({ dispatch: mockNavigationDispatch })
    mockIsBiometricsActive.mockResolvedValue(true)
    mockCommitPIN.mockResolvedValue(undefined)
    mockDisableBiometrics.mockResolvedValue(undefined)
  })

  // Covers: #44 — renders without crash, fingerprint image present
  it('renders fingerprint image and biometry toggle', async () => {
    const { getByTestId } = render(<UseBiometry />)

    expect(getByTestId('fingerprint-image')).toBeTruthy()
  })

  // Covers: #44 — shows Skip button when biometry not enabled
  it('renders Skip button when biometry is disabled', async () => {
    const { findByTestId } = render(<UseBiometry />)

    expect(await findByTestId('button-Biometry.Skip')).toBeTruthy()
  })

  // Covers: #44 — shows Continue button when biometry is enabled
  it('renders Continue button when biometry is enabled', async () => {
    mockUseStore.mockReturnValue([
      makeStore({ preferences: { useBiometry: true } }),
      mockDispatch,
    ])

    const { findByTestId } = render(<UseBiometry />)

    expect(await findByTestId('button-Global.Continue')).toBeTruthy()
  })

  // Covers: #44 — Continue calls commitPIN
  it('calls commitPIN when Continue is pressed', async () => {
    mockUseStore.mockReturnValue([
      makeStore({ preferences: { useBiometry: true } }),
      mockDispatch,
    ])

    const { findByTestId } = render(<UseBiometry />)
    const continueBtn = await findByTestId('button-Global.Continue')

    await act(async () => {
      fireEvent.press(continueBtn)
    })

    await waitFor(() => expect(mockCommitPIN).toHaveBeenCalledTimes(1))
  })

  // Covers: #44 — dispatches USE_BIOMETRY after Continue
  it('dispatches USE_BIOMETRY after Continue pressed', async () => {
    mockUseStore.mockReturnValue([
      makeStore({ preferences: { useBiometry: true } }),
      mockDispatch,
    ])

    const { findByTestId } = render(<UseBiometry />)
    const continueBtn = await findByTestId('button-Global.Continue')

    await act(async () => {
      fireEvent.press(continueBtn)
    })

    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'USE_BIOMETRY' }),
      ),
    )
  })

  // Covers: #44 — shows settings popup when biometry unavailable and toggle enabled
  it('shows settings popup when biometry unavailable and user tries to enable', async () => {
    mockIsBiometricsActive.mockResolvedValue(false)

    const { getByTestId, findByTestId } = render(<UseBiometry />)

    // Find the Switch and toggle it on
    const switchEl = getByTestId('switch') as any

    await act(async () => {
      fireEvent(switchEl, 'valueChange', true)
    })

    expect(await findByTestId('settings-popup')).toBeTruthy()
  })

  // Covers: #44 — shows "not enabled" text when biometry unavailable
  it('renders not-enabled biometry text when biometry unavailable', async () => {
    mockIsBiometricsActive.mockResolvedValue(false)

    const { findByText } = render(<UseBiometry />)

    expect(await findByText('Biometry.NotEnabledText1')).toBeTruthy()
  })

  // Covers: #44 — shows enabled biometry text when biometry available
  it('renders enabled biometry text when biometry available', async () => {
    mockIsBiometricsActive.mockResolvedValue(true)

    const { findByText } = render(<UseBiometry />)

    expect(await findByText('Biometry.EnabledText1')).toBeTruthy()
  })
})
