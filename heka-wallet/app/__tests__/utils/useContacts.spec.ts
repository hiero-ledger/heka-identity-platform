import { BifoldError } from '@bifold/core'
import { renderHook, waitFor } from '@testing-library/react-native'
import { DeviceEventEmitter } from 'react-native'

import { useContacts } from '../../src/utils/useContacts'

const mockAgent = {
  isInitialized: true,
  config: { logger: { error: jest.fn() } },
  didcomm: {
    basicMessages: { findAllByQuery: jest.fn(async () => []) },
    proofs: { findAllByQuery: jest.fn(async () => []) },
    credentials: { findAllByQuery: jest.fn(async () => []) },
  },
}

let mockConnections: { records: unknown[] } = { records: [] }

jest.mock('@bifold/core', () => {
  const store = [{ preferences: { developerModeEnabled: false } }]
  const services = [{ contactHideList: [] }]
  return {
    BifoldError: jest.fn(),
    EventTypes: { ERROR_ADDED: 'ERROR_ADDED' },
    TOKENS: { CONFIG: 'config' },
    useStore: () => store,
    useServices: () => services,
  }
})

jest.mock('@bifold/react-hooks', () => ({
  useConnections: () => mockConnections,
  useOptionalAgent: () => ({ agent: mockAgent }),
}))

jest.mock('@credo-ts/didcomm', () => ({
  DidCommConnectionType: { Mediator: 'mediator' },
  DidCommDidExchangeState: { Completed: 'completed' },
}))

jest.mock('react-i18next', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})

describe('useContacts', () => {
  it('stops loading with an empty list when there are no connections', async () => {
    mockConnections = { records: [] }

    const { result } = renderHook(() => useContacts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.contacts).toEqual([])
  })

  it('hides mediator and not completed connections when developer mode is off', async () => {
    const contact = {
      id: 'contact',
      connectionTypes: [],
      state: 'completed',
      theirLabel: 'Issuer',
      createdAt: new Date(),
    }
    const mediator = {
      id: 'mediator',
      connectionTypes: ['mediator'],
      state: 'completed',
      theirLabel: 'Mediator',
      createdAt: new Date(),
    }
    const pending = {
      id: 'pending',
      connectionTypes: [],
      state: 'request-sent',
      theirLabel: 'Verifier',
      createdAt: new Date(),
    }
    mockConnections = { records: [contact, mediator, pending] }

    const { result } = renderHook(() => useContacts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.contacts).toEqual([contact])
  })

  it('reports error 1046 and stops loading when the messages cannot be loaded', async () => {
    const emit = jest.spyOn(DeviceEventEmitter, 'emit')
    const failure = new Error('Storage unavailable')
    mockAgent.didcomm.basicMessages.findAllByQuery.mockRejectedValueOnce(failure)
    mockConnections = {
      records: [
        { id: 'contact', connectionTypes: [], state: 'completed', theirLabel: 'Issuer', createdAt: new Date() },
      ],
    }

    const { result } = renderHook(() => useContacts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(BifoldError).toBeCalledTimes(1)
    expect(BifoldError).toBeCalledWith('Error.Title1046', 'Error.Message1046', 'Storage unavailable', 1046)
    expect(emit).toBeCalledWith('ERROR_ADDED', jest.mocked(BifoldError).mock.instances[0])
    expect(mockAgent.config.logger.error).toBeCalledWith('Error fetching contacts:', failure)
    expect(result.current.contacts).toEqual([])
    emit.mockRestore()
  })
})
