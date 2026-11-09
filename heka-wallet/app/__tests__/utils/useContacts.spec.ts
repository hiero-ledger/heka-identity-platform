import { renderHook, waitFor } from '@testing-library/react-native'

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
})
