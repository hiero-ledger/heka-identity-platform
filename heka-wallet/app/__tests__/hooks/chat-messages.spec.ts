import { getMessageEventRole } from '@bifold/core/src/utils/helpers'
import { DidCommConnectionRecord, DidCommCredentialExchangeRecord, DidCommCredentialState } from '@credo-ts/didcomm'
import { GlobalLogger } from '@heka-wallet/shared'
import { act, renderHook, waitFor } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'
import { Role } from '../../src/components/chat/types'
import { resolveOverlay } from '../../src/credentials'
import { useChatMessagesByConnection } from '../../src/hooks/chat-messages'

jest.mock('@bifold/core', () => {
  const store = [{ preferences: { alternateContactNames: {} } }]
  return {
    getConnectionName: (connection: { theirLabel?: string }) => connection?.theirLabel,
    Screens: {},
    Stacks: {},
    useStore: () => store,
  }
})

jest.mock('@bifold/core/src/utils/helpers', () => ({ getMessageEventRole: jest.fn() }))

// Replaced, not mutated, per test so the hook sees stable arrays between renders.
let mockBasicMessages: unknown[] = []
let mockCredentials: unknown[] = []

jest.mock('@bifold/react-hooks', () => {
  const none: unknown[] = []
  return {
    useBasicMessagesByConnectionId: () => mockBasicMessages,
    useCredentialsByConnectionId: () => mockCredentials,
    useProofsByConnectionId: () => none,
  }
})

jest.mock('@credo-ts/didcomm', () => ({
  DidCommConnectionRecord: class DidCommConnectionRecord {},
  DidCommCredentialExchangeRecord: class DidCommCredentialExchangeRecord {},
  DidCommProofExchangeRecord: class DidCommProofExchangeRecord {},
  DidCommCredentialState: { Done: 'done' },
  DidCommProofState: {},
}))

jest.mock('@heka-wallet/shared', () => {
  const theme = { ChatTheme: { rightText: {}, rightTextHighlighted: {} }, ColorPalette: { brand: {} } }
  const logger = { error: jest.fn() }
  return {
    ColorPalette: { brand: {}, grayscale: {}, semantic: {} },
    GlobalLogger: { createContextLogger: () => logger },
    useHekaTheme: () => theme,
  }
})

jest.mock('@react-navigation/native', () => {
  const navigation = { navigate: jest.fn() }
  return { useNavigation: () => navigation }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('../../src/components/chat/ChatEvent', () => ({
  ChatEvent: () => null,
  EventStates: { Accepted: 'accepted' },
  EventTypes: { Credential: 'credential' },
}))
jest.mock('../../src/credentials', () => ({ resolveOverlay: jest.fn() }))

// The hook's module logger; the mock factory returns the same instance on every call.
const logger = GlobalLogger.createContextLogger('ChatMessages')

const createConnection = (createdAt: Date) =>
  ({ id: 'connection-id', theirLabel: 'Issuer', createdAt }) as unknown as DidCommConnectionRecord

const createCredential = () =>
  Object.assign(Object.create(DidCommCredentialExchangeRecord.prototype), {
    id: 'credential-id',
    type: 'CredentialRecord',
    state: DidCommCredentialState.Done,
    createdAt: new Date('2026-01-02T00:00:00Z'),
  })

describe('useChatMessagesByConnection', () => {
  afterEach(() => {
    mockBasicMessages = []
    mockCredentials = []
  })

  it('keeps a credential event and the rest of the chat when its overlay fails', async () => {
    const connection = Object.assign(createConnection(new Date('2026-01-01T00:00:00Z')), {
      imageUrl: 'https://issuer.example/logo.png',
    })
    mockCredentials = [createCredential()]
    const error = new Error('Overlay bundle unavailable')
    mockFunction(resolveOverlay).mockRejectedValue(error)

    const { result } = renderHook(() => useChatMessagesByConnection(connection))

    await waitFor(() => expect(result.current).toHaveLength(2))
    expect(result.current.map((message) => message._id)).toEqual(['credential-id', 'connected'])
    expect(result.current[0].user._id).toBe(Role.me)
    expect(logger.error).toBeCalledWith('Failed to resolve the credential overlay', {
      recordId: 'credential-id',
      error: error.stack,
    })
  })

  it('logs a failed preparation and keeps the messages empty', async () => {
    mockBasicMessages = [{ id: 'message-id', content: 'Hello', createdAt: new Date('2026-01-02T00:00:00Z') }]
    const error = new Error('Unknown message role')
    mockFunction(getMessageEventRole).mockImplementation(() => {
      throw error
    })

    const { result } = renderHook(() => useChatMessagesByConnection(createConnection(new Date())))

    await waitFor(() => expect(logger.error).toBeCalledWith('Failed to prepare chat messages', error))
    expect(result.current).toEqual([])
  })

  it('keeps the newer result when an older run finishes last', async () => {
    const first = createConnection(new Date('2026-01-01T00:00:00Z'))
    const updated = createConnection(new Date('2026-02-01T00:00:00Z'))
    mockCredentials = [createCredential()]
    let resolveFirstOverlay: (overlay: object) => void = () => undefined
    mockFunction(resolveOverlay)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirstOverlay = resolve)) as never)
      .mockResolvedValue({} as never)

    const { result, rerender } = renderHook(
      ({ connection }: { connection: DidCommConnectionRecord }) => useChatMessagesByConnection(connection),
      { initialProps: { connection: first } }
    )
    rerender({ connection: updated })
    await waitFor(() => expect(result.current[1]?.createdAt).toEqual(updated.createdAt))

    await act(async () => resolveFirstOverlay({}))

    expect(resolveOverlay).toBeCalledTimes(2)
    expect(result.current[1].createdAt).toEqual(updated.createdAt)
  })

  it('uses the current connection for the connected message', async () => {
    const first = createConnection(new Date('2026-01-01T00:00:00Z'))
    const updated = createConnection(new Date('2026-02-01T00:00:00Z'))

    const { result, rerender } = renderHook(
      ({ connection }: { connection: DidCommConnectionRecord }) => useChatMessagesByConnection(connection),
      { initialProps: { connection: first } }
    )
    await waitFor(() => expect(result.current).toHaveLength(1))

    rerender({ connection: updated })

    await waitFor(() => expect(result.current[0].createdAt).toEqual(updated.createdAt))
  })
})
