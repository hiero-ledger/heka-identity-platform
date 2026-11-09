import type { DigitalCredentialsRequest } from '@animo-id/expo-digital-credentials-api'

import { act, renderHook } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'
import { dcApiResolveRequest, dcApiSendErrorResponse, dcApiSendResponse } from '../../src/credentials/dcApi'
import { useDcApiSharing } from '../../src/hooks/useDcApiSharing'
import { HekaWalletAgent } from '../../src/utils/agent'
import { unlockDcApiAgent } from '../../src/utils/unlockDcApiAgent'

jest.mock('@bifold/core', () => {
  const services = [jest.fn()]
  return { TOKENS: { FN_PIN_HASH_ALGORITHM: 'hash' }, useServices: () => services }
})

jest.mock('@heka-wallet/shared', () => {
  const logger = { error: jest.fn() }
  return { GlobalLogger: { createContextLogger: () => logger } }
})

jest.mock('../../src/credentials/dcApi', () => ({
  dcApiResolveRequest: jest.fn(),
  dcApiSendErrorResponse: jest.fn(),
  dcApiSendResponse: jest.fn(),
}))
jest.mock('../../src/utils/agent', () => ({}))
jest.mock('../../src/utils/unlockDcApiAgent', () => ({ unlockDcApiAgent: jest.fn() }))

const request = {} as DigitalCredentialsRequest

const createAgent = () =>
  ({
    shutdown: jest.fn().mockResolvedValue(undefined),
    config: { logger: { error: jest.fn(), warn: jest.fn() } },
  }) as unknown as HekaWalletAgent

// An unlock the test finishes after the user cancels.
const deferUnlock = () => {
  const deferred: { resolve: (agent: HekaWalletAgent | null) => void; reject: (error: Error) => void } = {
    resolve: () => undefined,
    reject: () => undefined,
  }
  mockFunction(unlockDcApiAgent).mockReturnValue(
    new Promise((resolve, reject) => Object.assign(deferred, { resolve, reject }))
  )
  return deferred
}

// Enters the PIN, taps the backdrop while the wallet unlocks, then finishes the unlock with `finish`.
const cancelDuringUnlock = async (finish: (unlock: ReturnType<typeof deferUnlock>) => void) => {
  const unlock = deferUnlock()
  const { result } = renderHook(() => useDcApiSharing(request))

  let pinEntered: Promise<boolean> = Promise.resolve(false)
  act(() => {
    pinEntered = result.current.onPinEntered('123456')
  })
  act(() => result.current.onCancel())
  finish(unlock)
  let clearKeyPad = false
  await act(async () => {
    clearKeyPad = !(await pinEntered)
  })

  return { result, clearKeyPad }
}

describe('useDcApiSharing', () => {
  beforeEach(() => {
    mockFunction(dcApiResolveRequest).mockResolvedValue({} as never)
    mockFunction(dcApiSendResponse).mockResolvedValue(undefined as never)
  })

  it('sends the response with the unlocked wallet and shuts the agent down', async () => {
    const agent = createAgent()
    mockFunction(unlockDcApiAgent).mockResolvedValue(agent)
    const { result } = renderHook(() => useDcApiSharing(request))

    await act(async () => {
      await expect(result.current.onPinEntered('123456')).resolves.toBe(true)
    })

    expect(dcApiResolveRequest).toBeCalledWith(agent, request)
    expect(dcApiSendResponse).toBeCalledTimes(1)
    expect(dcApiSendErrorResponse).not.toBeCalled()
    expect(agent.shutdown).toBeCalledTimes(1)
  })

  it('asks for the PIN again when it is wrong', async () => {
    mockFunction(unlockDcApiAgent).mockResolvedValue(null)
    const { result } = renderHook(() => useDcApiSharing(request))

    await act(async () => {
      await expect(result.current.onPinEntered('000000')).resolves.toBe(false)
    })

    expect(result.current.pinError).toBe(true)
    expect(result.current.isProcessing).toBe(false)
    expect(dcApiSendResponse).not.toBeCalled()
    expect(dcApiSendErrorResponse).not.toBeCalled()
  })

  it('sends only the cancel response and shuts the agent down when the unlock succeeds after a cancel', async () => {
    const agent = createAgent()

    await cancelDuringUnlock((unlock) => unlock.resolve(agent))

    expect(dcApiSendErrorResponse).toBeCalledTimes(1)
    expect(dcApiSendErrorResponse).toBeCalledWith('The request was cancelled')
    expect(dcApiResolveRequest).not.toBeCalled()
    expect(dcApiSendResponse).not.toBeCalled()
    expect(agent.shutdown).toBeCalledTimes(1)
  })

  it('sends only the cancel response when the unlock fails after a cancel', async () => {
    await cancelDuringUnlock((unlock) => unlock.reject(new Error('Store unavailable')))

    expect(dcApiSendErrorResponse).toBeCalledTimes(1)
    expect(dcApiSendErrorResponse).toBeCalledWith('The request was cancelled')
  })

  it('shows no PIN error when the PIN turns out wrong after a cancel', async () => {
    const { result, clearKeyPad } = await cancelDuringUnlock((unlock) => unlock.resolve(null))

    expect(result.current.pinError).toBe(false)
    expect(clearKeyPad).toBe(false)
    expect(dcApiSendErrorResponse).toBeCalledTimes(1)
    expect(dcApiSendErrorResponse).toBeCalledWith('The request was cancelled')
  })
})
