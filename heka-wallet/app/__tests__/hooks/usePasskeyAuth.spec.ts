import { GlobalLogger } from '@heka-wallet/shared'
import { act, renderHook } from '@testing-library/react-native'

import { usePasskeyAuth } from '../../src/hooks/usePasskeyAuth'

const mockPasskeysStore = { getUser: jest.fn(), register: jest.fn(), authenticate: jest.fn() }

jest.mock('@heka-wallet/shared', () => {
  const logger = { error: jest.fn() }
  return { GlobalLogger: { createContextLogger: () => logger } }
})
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => false }))
jest.mock('../../src/contexts', () => ({ useRootStore: () => ({ passkeysStore: mockPasskeysStore }) }))

const mockLogger = GlobalLogger.createContextLogger('PasskeyAuth')

describe('usePasskeyAuth', () => {
  it('reports and logs an authentication failure instead of rejecting', async () => {
    const error = new Error('Passkey cancelled')
    mockPasskeysStore.getUser.mockResolvedValue('user')
    mockPasskeysStore.authenticate.mockRejectedValue(error)
    const onComplete = jest.fn()

    const { result } = renderHook(() => usePasskeyAuth(onComplete))
    await act(() => result.current.authenticate())

    expect(result.current.error).toBe(error)
    expect(result.current.isLoading).toBe(false)
    expect(onComplete).not.toBeCalled()
    expect(mockLogger.error).toBeCalledWith(
      'Passkey auth failed',
      expect.objectContaining({ action: 'authenticate', error: error.stack })
    )
  })

  it('reports a failure to read the user before registration', async () => {
    const error = new Error('No user identity')
    mockPasskeysStore.getUser.mockRejectedValue(error)
    const onComplete = jest.fn()

    const { result } = renderHook(() => usePasskeyAuth(onComplete))
    await act(() => result.current.register())

    expect(result.current.error).toBe(error)
    expect(mockPasskeysStore.register).not.toBeCalled()
    expect(onComplete).not.toBeCalled()
  })

  it('completes after a successful registration', async () => {
    mockPasskeysStore.getUser.mockResolvedValue('user')
    mockPasskeysStore.register.mockResolvedValue(undefined)
    const onComplete = jest.fn()

    const { result } = renderHook(() => usePasskeyAuth(onComplete))
    await act(() => result.current.register())

    expect(mockPasskeysStore.register).toBeCalledWith('user')
    expect(onComplete).toBeCalledTimes(1)
    expect(result.current.error).toBeUndefined()
  })
})
