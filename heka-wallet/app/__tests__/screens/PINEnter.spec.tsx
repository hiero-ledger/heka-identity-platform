import { act, render } from '@testing-library/react-native'
import React from 'react'

import PINEnter from '../../src/screens/PINEnter'

const mockCheckWalletPIN = jest.fn()
const mockNavigationDispatch = jest.fn()
let mockOnPinEntered: ((PIN: string) => Promise<boolean>) | undefined

interface MockStoreState {
  loginAttempt: { loginAttempts: number; lockoutDate?: number; servedPenalty?: boolean }
  lockout: { displayNotification: boolean }
  preferences: { useBiometry: boolean }
}

type MockStoreAction =
  | { type: 'loginAttempt/attemptUpdated'; payload: MockStoreState['loginAttempt'][] }
  | { type: 'lockout/lockoutUpdated'; payload: MockStoreState['lockout'][] }
  | { type: 'preferences/useBiometry'; payload: boolean[] }

jest.mock('@bifold/core', () => {
  const { useReducer } = jest.requireActual('react')
  const minute = 60000
  const DispatchAction = {
    ATTEMPT_UPDATED: 'loginAttempt/attemptUpdated',
    LOCKOUT_UPDATED: 'lockout/lockoutUpdated',
    USE_BIOMETRY: 'preferences/useBiometry',
  }
  // Mirrors Bifold's reducer: ATTEMPT_UPDATED replaces loginAttempt with the payload.
  const reducer = (state: MockStoreState, action: MockStoreAction): MockStoreState => {
    switch (action.type) {
      case 'loginAttempt/attemptUpdated':
        return { ...state, loginAttempt: action.payload[action.payload.length - 1] }
      case 'lockout/lockoutUpdated':
        return { ...state, lockout: { ...state.lockout, ...action.payload[0] } }
      default:
        return state
    }
  }
  const initialState: MockStoreState = {
    loginAttempt: { loginAttempts: 0 },
    lockout: { displayNotification: false },
    preferences: { useBiometry: false },
  }
  const auth = {
    checkWalletPIN: (PIN: string) => mockCheckWalletPIN(PIN),
    getWalletSecret: jest.fn(),
    isBiometricsActive: jest.fn(),
    disableBiometrics: jest.fn(),
  }
  const services = [{ error: jest.fn() }, {}]

  return {
    attemptLockoutConfig: {
      baseRules: { 5: minute, 10: 10 * minute, 15: 60 * minute },
      thresholdRules: { threshold: 20, increment: 5, thresholdPenaltyDuration: 24 * 60 * minute },
    },
    BifoldError: class extends Error {},
    Button: () => null,
    ButtonType: { Secondary: 'Secondary' },
    DispatchAction,
    EventTypes: { BIOMETRY_ERROR: 'BiometryError', ERROR_ADDED: 'ErrorAdded' },
    Screens: { AttemptLockout: 'AttemptLockout' },
    TOKENS: { UTIL_LOGGER: 'logger', CONFIG: 'config' },
    useAuth: () => auth,
    useServices: () => services,
    useStore: () => useReducer(reducer, initialState),
  }
})

jest.mock('@heka-wallet/shared', () => ({
  useHekaTheme: () => ({ TextTheme: {}, ColorPalette: { brand: {} }, Spacing: {} }),
}))

jest.mock('@react-navigation/native', () => {
  const navigation = { dispatch: (action: unknown) => mockNavigationDispatch(action) }
  return {
    useNavigation: () => navigation,
    CommonActions: { reset: (state: unknown) => ({ type: 'RESET', payload: state }) },
  }
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

jest.mock('../../src/components/modals', () => ({ AlertModal: () => null }))
jest.mock('../../src/components/views/LoadingView', () => ({ Loader: () => null }))

const wrongPIN = '000000'

const enterWrongPIN = async (times: number) => {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await mockOnPinEntered?.(wrongPIN)
    })
  }
}

describe('PINEnter', () => {
  beforeEach(() => {
    mockOnPinEntered = undefined
    mockCheckWalletPIN.mockResolvedValue(false)
  })

  it('locks the wallet out after the fifth wrong PIN', async () => {
    render(<PINEnter setAuthenticated={jest.fn()} />)

    await enterWrongPIN(5)

    expect(mockNavigationDispatch).toHaveBeenCalledTimes(1)
    expect(mockNavigationDispatch).toHaveBeenCalledWith({
      type: 'RESET',
      payload: { index: 0, routes: [{ name: 'AttemptLockout' }] },
    })
  })

  it('does not lock the wallet out before the fifth wrong PIN', async () => {
    render(<PINEnter setAuthenticated={jest.fn()} />)

    await enterWrongPIN(4)

    expect(mockNavigationDispatch).not.toHaveBeenCalled()
  })
})
