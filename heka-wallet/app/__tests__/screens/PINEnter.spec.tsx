import { act, render } from '@testing-library/react-native'
import React from 'react'

import PINEnter from '../../src/screens/PINEnter'

const mockCheckWalletPIN = jest.fn()
const mockNavigationDispatch = jest.fn()
let mockOnPinEntered: ((PIN: string) => Promise<boolean>) | undefined
let mockInitialLoginAttempt: { loginAttempts: number; lockoutDate?: number; servedPenalty?: boolean } = {
  loginAttempts: 0,
}
const mockAttemptUpdates: unknown[] = []
// One store for every useStore() call, like Bifold's context: the PIN hooks read each other's updates
let mockStoreState: MockStoreState | undefined
const mockStoreListeners = new Set<() => void>()

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
  const { useSyncExternalStore } = jest.requireActual('react')
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
  const initialState: Omit<MockStoreState, 'loginAttempt'> = {
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
  const getState = (): MockStoreState => {
    if (!mockStoreState) mockStoreState = { ...initialState, loginAttempt: mockInitialLoginAttempt }
    return mockStoreState
  }
  const subscribe = (listener: () => void) => {
    mockStoreListeners.add(listener)
    return () => mockStoreListeners.delete(listener)
  }
  const dispatch = (action: MockStoreAction) => {
    if (action.type === DispatchAction.ATTEMPT_UPDATED) mockAttemptUpdates.push(action.payload[0])
    mockStoreState = reducer(getState(), action)
    mockStoreListeners.forEach((listener) => listener())
  }

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
    useStore: () => [useSyncExternalStore(subscribe, getState), dispatch],
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
    mockInitialLoginAttempt = { loginAttempts: 0 }
    mockAttemptUpdates.length = 0
    mockStoreState = undefined
    mockStoreListeners.clear()
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

  // Android runs the legacy root, which renders each dispatch made after an await on its own. An extra
  // update that only clears servedPenalty renders "5 attempts, penalty not served" and locks the wallet again.
  // Jest batches these updates, so the tests check that one update moves past the served lockout.
  it('updates the attempts once on a wrong PIN after the lockout was served', async () => {
    mockInitialLoginAttempt = { loginAttempts: 5, servedPenalty: true }
    render(<PINEnter setAuthenticated={jest.fn()} />)

    await enterWrongPIN(1)

    expect(mockAttemptUpdates).toEqual([{ loginAttempts: 6 }])
    expect(mockNavigationDispatch).not.toHaveBeenCalled()
  })

  it('resets the attempts once on the right PIN after the lockout was served', async () => {
    mockInitialLoginAttempt = { loginAttempts: 5, servedPenalty: true }
    mockCheckWalletPIN.mockResolvedValue(true)
    render(<PINEnter setAuthenticated={jest.fn()} />)

    await act(async () => {
      await mockOnPinEntered?.('123456')
    })

    expect(mockAttemptUpdates).toEqual([{ loginAttempts: 0 }])
    expect(mockNavigationDispatch).not.toHaveBeenCalled()
  })
})
