import { act, render, screen } from '@testing-library/react-native'
import React from 'react'

import AttemptLockout from '../../src/screens/AttemptLockout'

const mockLockoutDate = { current: 0 }

jest.mock('@bifold/core', () => {
  const dispatch = jest.fn()
  return {
    Button: ({ title }: { title: string }) => {
      const { Text } = jest.requireActual('react-native')
      return <Text>{title}</Text>
    },
    ButtonType: { Primary: 'Primary' },
    DispatchAction: { ATTEMPT_UPDATED: 'loginAttempt/attemptUpdated' },
    Screens: { EnterPIN: 'EnterPIN' },
    useStore: () => [{ loginAttempt: { loginAttempts: 5, lockoutDate: mockLockoutDate.current } }, dispatch],
  }
})

jest.mock('@bifold/core/src/constants', () => ({ second: 1000, minute: 60000, hour: 3600000 }))

jest.mock('@heka-wallet/shared', () => ({
  useHekaTheme: () => ({ TextTheme: {}, ColorPalette: { brand: {} }, Spacing: {} }),
}))

jest.mock('@react-navigation/native', () => {
  const navigation = { dispatch: jest.fn() }
  return { useNavigation: () => navigation, CommonActions: { reset: jest.fn() } }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../src/assets/safe.svg', () => 'SafeImage')

describe('AttemptLockout', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockLockoutDate.current = Date.now() + 3000
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows Try again once the lockout is over and stops ticking', () => {
    render(<AttemptLockout />)

    expect(screen.queryByText('Global.TryAgain')).toBeNull()

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(screen.getByText('Global.TryAgain')).toBeTruthy()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('leaves no timer running after unmount', () => {
    const { unmount } = render(<AttemptLockout />)

    act(() => {
      jest.advanceTimersByTime(1000)
    })
    unmount()

    expect(jest.getTimerCount()).toBe(0)
  })
})
