import { render } from '@testing-library/react-native'
import React from 'react'
import { BackHandler } from 'react-native'

import Onboarding from '../../src/screens/Onboarding'

jest.mock('@bifold/core', () => {
  const store = { onboarding: { didCompleteTutorial: false } }
  const dispatch = jest.fn()
  return {
    Button: () => null,
    ButtonType: { Primary: 'Primary', Secondary: 'Secondary' },
    DispatchAction: { DID_COMPLETE_TUTORIAL: 'onboarding/didCompleteTutorial' },
    useStore: () => [store, dispatch],
  }
})

jest.mock('@heka-wallet/shared', () => ({
  useHekaTheme: () => ({
    OnboardingTheme: { pagerDot: {}, pagerDotActive: {}, pagerDotInactive: {} },
    ColorPalette: { brand: {} },
    Spacing: {},
  }),
}))

// Focus is the mount and blur is the unmount.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react')
  const navigation = { goBack: jest.fn(), navigate: jest.fn() }
  return {
    useNavigation: () => navigation,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('react-native-animated-pagination-dots', () => ({ ExpandingDot: () => null }))
jest.mock('../../src/assets/credentials.svg', () => 'CredentialsImage')
jest.mock('../../src/assets/qr_code.svg', () => 'QrCodeImage')
jest.mock('../../src/assets/safe.svg', () => 'SafeImage')
jest.mock('../../src/assets/wallet.svg', () => 'WalletImage')
jest.mock('../../src/components/views/OnBoardingPage', () => ({ OnBoardingPage: () => null }))
jest.mock('../../src/config', () => ({ isWalletBackupEnabled: false }))
jest.mock('../../src/navigators', () => ({ Screens: {}, Stacks: {} }))

describe('Onboarding', () => {
  it('removes the hardware back listener when the screen loses focus', () => {
    const remove = jest.fn()
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove })

    const { unmount } = render(<Onboarding pages={[]} nextButtonText="" previousButtonText="" />)

    expect(addEventListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function))
    expect(remove).not.toHaveBeenCalled()

    unmount()

    expect(remove).toHaveBeenCalledTimes(addEventListener.mock.calls.length)
  })
})
