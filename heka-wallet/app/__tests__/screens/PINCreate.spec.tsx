import { act, render } from '@testing-library/react-native'
import React from 'react'

import PINCreate from '../../src/screens/PINCreate'

const mockAgent = { id: 'agent' }
const mockRekeyWallet = jest.fn()
const mockStore = { preferences: { useBiometry: false } }
let mockOnPinEntered: ((PIN: string) => Promise<boolean>) | undefined

jest.mock('@bifold/core', () => {
  const auth = {
    setPIN: jest.fn(),
    checkWalletPIN: jest.fn().mockResolvedValue(true),
    rekeyWallet: (...args: unknown[]) => mockRekeyWallet(...args),
  }
  const dispatch = jest.fn()
  const services = [{ PINSecurity: { rules: {} } }]
  return {
    BifoldError: class extends Error {},
    DispatchAction: { DID_CREATE_PIN: 'onboarding/didCreatePIN' },
    EventTypes: { ERROR_ADDED: 'ErrorAdded' },
    Screens: { CreatePIN: 'CreatePIN', Settings: 'Settings' },
    TOKENS: { CONFIG: 'config', COMPONENT_BUTTON: 'button' },
    useAuth: () => auth,
    useServices: () => services,
    // A new state object per render, as Bifold's reducer returns after a change.
    useStore: () => [{ preferences: { ...mockStore.preferences } }, dispatch],
  }
})

jest.mock('@bifold/core/src/utils/PINValidation', () => ({ createPINValidations: () => [] }))

jest.mock('@heka-wallet/shared', () => ({
  useHekaTheme: () => ({ TextTheme: {}, Spacing: {} }),
}))

jest.mock('@react-navigation/native', () => {
  const navigation = { navigate: jest.fn() }
  return { useNavigation: () => navigation }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../src/components/misc/PinKeyPad', () => ({
  __esModule: true,
  default: ({ onPinEntered }: { onPinEntered: (PIN: string) => Promise<boolean> }) => {
    mockOnPinEntered = onPinEntered
    return null
  },
}))
jest.mock('../../src/components/modals/AlertModal', () => ({ AlertModal: () => null }))
jest.mock('../../src/components/views/LoadingView', () => ({ Loader: () => null }))
jest.mock('../../src/utils/agent', () => ({ useHekaAgent: () => ({ agent: mockAgent }) }))

const enterPIN = async (PIN: string) => {
  await act(async () => {
    await mockOnPinEntered?.(PIN)
  })
}

describe('PINCreate', () => {
  it('rekeys the wallet with the current biometry preference', async () => {
    mockStore.preferences.useBiometry = false
    mockRekeyWallet.mockResolvedValue(true)
    const props = {
      setAuthenticated: jest.fn(),
      route: { key: 'CreatePIN', name: 'CreatePIN', params: { updatePin: true } },
      navigation: {},
    } as unknown as React.ComponentProps<typeof PINCreate>

    const { rerender } = render(<PINCreate {...props} />)

    await enterPIN('111111')
    await enterPIN('222222')

    // The preference changes while the screen is open.
    mockStore.preferences.useBiometry = true
    rerender(<PINCreate {...props} />)

    await enterPIN('222222')

    expect(mockRekeyWallet).toBeCalledWith(mockAgent, '111111', '222222', true)
  })
})
