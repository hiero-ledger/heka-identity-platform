import { BifoldError } from '@bifold/core'
import { hashPIN } from '@bifold/core/src/utils/crypto'
import { act, renderHook } from '@testing-library/react-native'
import { DeviceEventEmitter } from 'react-native'

import { mockFunction } from '../../../jest-helpers/helpers'
import { PINEntryUsage, usePinUnlock } from '../../src/hooks/usePinUnlock'

const mockGetWalletSecret = jest.fn()

jest.mock('@bifold/core', () => {
  const auth = { checkWalletPIN: jest.fn(), getWalletSecret: () => mockGetWalletSecret() }
  const store = [{ loginAttempt: { loginAttempts: 0 } }, jest.fn()]
  return {
    BifoldError: jest.fn(),
    DispatchAction: {},
    EventTypes: { ERROR_ADDED: 'ERROR_ADDED' },
    useAuth: () => auth,
    useStore: () => store,
  }
})

// Jest maps every @bifold/core/src path to one module, so this mock also supplies minPINLength.
jest.mock('@bifold/core/src/utils/crypto', () => ({ minPINLength: 6, hashPIN: jest.fn() }))

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('../../src/hooks/usePinLockout', () => ({
  getLockoutPenalty: jest.fn(),
  usePinLockout: () => ({ displayLockoutWarning: false }),
}))

const walletSecret = { key: 'right-key', salt: 'salt' }

const checkPIN = async (setAuthenticated = jest.fn()) => {
  const hook = renderHook(() => usePinUnlock(PINEntryUsage.PINCheck, setAuthenticated))
  let accepted: boolean | undefined
  await act(async () => {
    accepted = await hook.result.current.onPINInputCompleted('123456')
  })
  return { ...hook, accepted }
}

describe('usePinUnlock for a PIN check', () => {
  let emit: jest.SpyInstance

  beforeEach(() => {
    emit = jest.spyOn(DeviceEventEmitter, 'emit')
    mockGetWalletSecret.mockResolvedValue(walletSecret)
  })

  afterEach(() => {
    emit.mockRestore()
  })

  it('authenticates with the right PIN', async () => {
    mockFunction(hashPIN).mockResolvedValue('right-key')
    const setAuthenticated = jest.fn()

    const { result, accepted } = await checkPIN(setAuthenticated)

    expect(accepted).toBe(true)
    expect(setAuthenticated).toBeCalledWith(true)
    expect(result.current.alertModalVisible).toBe(false)
  })

  it('shows the incorrect PIN alert for a wrong PIN', async () => {
    mockFunction(hashPIN).mockResolvedValue('wrong-key')

    const { result, accepted } = await checkPIN()

    expect(accepted).toBe(false)
    expect(result.current.alertModalVisible).toBe(true)
    expect(emit).not.toBeCalled()
  })

  it('reports error 1042 without the incorrect PIN alert when the check fails', async () => {
    mockGetWalletSecret.mockResolvedValue(undefined)

    const { result, accepted } = await checkPIN()

    expect(accepted).toBe(false)
    expect(BifoldError).toBeCalledWith('Error.Title1042', 'Error.Message1042', 'Wallet secret is not defined', 1042)
    expect(emit).toBeCalledWith('ERROR_ADDED', jest.mocked(BifoldError).mock.instances[0])
    expect(result.current.alertModalVisible).toBe(false)
  })

  it('hides the alert and stays unauthenticated when the alert is closed', async () => {
    mockFunction(hashPIN).mockResolvedValue('wrong-key')
    const setAuthenticated = jest.fn()
    const { result } = await checkPIN(setAuthenticated)

    act(() => result.current.clearAlertModal())

    expect(result.current.alertModalVisible).toBe(false)
    expect(setAuthenticated).toBeCalledWith(false)
  })
})

describe('usePinUnlock for a wallet unlock', () => {
  it('does not change the authentication when the alert is closed', () => {
    const setAuthenticated = jest.fn()
    const { result } = renderHook(() => usePinUnlock(PINEntryUsage.WalletUnlock, setAuthenticated))

    act(() => result.current.clearAlertModal())

    expect(result.current.alertModalVisible).toBe(false)
    expect(setAuthenticated).not.toBeCalled()
  })
})
