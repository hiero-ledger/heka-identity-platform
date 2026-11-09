import { BifoldError } from '@bifold/core'
import { DidCommConnectionRecord } from '@credo-ts/didcomm'
import { GlobalLogger } from '@heka-wallet/shared'
import { act, renderHook } from '@testing-library/react-native'
import { DeviceEventEmitter } from 'react-native'

import { useConnectionRemoval } from '../../src/hooks/useConnectionRemoval'

const mockAgent = { didcomm: { connections: { deleteById: jest.fn() } } }

jest.mock('@bifold/core', () => ({
  BifoldError: jest.fn(),
  EventTypes: { ERROR_ADDED: 'ERROR_ADDED' },
}))

jest.mock('@bifold/react-hooks', () => {
  const none: unknown[] = []
  return { useCredentialByState: () => none }
})

jest.mock('@credo-ts/didcomm', () => ({
  DidCommCredentialState: { CredentialReceived: 'credential-received', Done: 'done' },
}))

jest.mock('@heka-wallet/shared', () => {
  const logger = { error: jest.fn() }
  return { GlobalLogger: { createContextLogger: () => logger } }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('../../src/utils/agent', () => ({ useHekaAgent: () => ({ agent: mockAgent }) }))

// The hook's module logger; the mock factory returns the same instance on every call.
const logger = GlobalLogger.createContextLogger('ConnectionRemoval')

const connection = { id: 'connection-id' } as DidCommConnectionRecord

describe('useConnectionRemoval', () => {
  let emit: jest.SpyInstance

  beforeEach(() => {
    emit = jest.spyOn(DeviceEventEmitter, 'emit')
  })

  afterEach(() => {
    emit.mockRestore()
  })

  it('deletes the connection, then calls onRemoved', async () => {
    mockAgent.didcomm.connections.deleteById.mockResolvedValue(undefined)
    const onRemoved = jest.fn()
    const { result } = renderHook(() => useConnectionRemoval(connection, onRemoved))

    await act(() => result.current.removeConnection())

    expect(mockAgent.didcomm.connections.deleteById).toBeCalledWith('connection-id')
    expect(onRemoved).toBeCalledTimes(1)
    expect(result.current.isRemoving).toBe(false)
    expect(BifoldError).not.toBeCalled()
  })

  it('reports error 1037 and does not call onRemoved when the delete fails', async () => {
    mockAgent.didcomm.connections.deleteById.mockRejectedValue(new Error('Storage unavailable'))
    const onRemoved = jest.fn()
    const { result } = renderHook(() => useConnectionRemoval(connection, onRemoved))

    await act(() => result.current.removeConnection())

    expect(BifoldError).toBeCalledWith('Error.Title1037', 'Error.Message1037', 'Storage unavailable', 1037)
    expect(emit).toBeCalledWith('ERROR_ADDED', jest.mocked(BifoldError).mock.instances[0])
    expect(onRemoved).not.toBeCalled()
    expect(result.current.isRemoving).toBe(false)
  })

  it('logs a failing onRemoved without reporting a failed delete', async () => {
    mockAgent.didcomm.connections.deleteById.mockResolvedValue(undefined)
    const onRemoved = jest.fn(() => {
      throw new Error('Navigation failed')
    })
    const { result } = renderHook(() => useConnectionRemoval(connection, onRemoved))

    await act(() => result.current.removeConnection())

    expect(onRemoved).toBeCalledTimes(1)
    expect(BifoldError).not.toBeCalled()
    expect(emit).not.toBeCalledWith('ERROR_ADDED', expect.anything())
    expect(logger.error).toBeCalledWith('Failed to finish the connection removal', {
      connectionId: 'connection-id',
      error: expect.stringContaining('Navigation failed'),
    })
    expect(result.current.isRemoving).toBe(false)
  })
})
