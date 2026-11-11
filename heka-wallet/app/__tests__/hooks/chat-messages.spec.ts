import { getMessageEventRole } from '@bifold/core/src/utils/helpers'
import {
  DidCommConnectionRecord,
  DidCommCredentialExchangeRecord,
  DidCommCredentialState,
  DidCommProofExchangeRecord,
  DidCommProofState,
} from '@credo-ts/didcomm'
import { GlobalLogger } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import { act, renderHook, waitFor } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'
import { ExtendedChatMessage } from '../../src/components/chat/messages'
import { Role } from '../../src/components/chat/types'
import { resolveOverlay } from '../../src/credentials'
import { useChatMessagesByConnection } from '../../src/hooks/chat-messages'

jest.mock('@bifold/core', () => {
  const store = [{ preferences: { alternateContactNames: {} } }]
  return {
    getConnectionName: (connection: { theirLabel?: string }) => connection?.theirLabel,
    Screens: {
      CredentialDetails: 'CredentialDetails',
      CredentialOffer: 'CredentialOffer',
      ProofRequest: 'ProofRequest',
    },
    Stacks: { ContactStack: 'ContactStack', NotificationStack: 'NotificationStack' },
    useStore: () => store,
  }
})

jest.mock('@bifold/core/src/utils/helpers', () => ({ getMessageEventRole: jest.fn() }))

// Replaced, not mutated, per test so the hook sees stable arrays between renders.
let mockBasicMessages: unknown[] = []
let mockCredentials: unknown[] = []
let mockProofs: unknown[] = []

jest.mock('@bifold/react-hooks', () => ({
  useBasicMessagesByConnectionId: () => mockBasicMessages,
  useCredentialsByConnectionId: () => mockCredentials,
  useProofsByConnectionId: () => mockProofs,
}))

jest.mock('@credo-ts/didcomm', () => ({
  DidCommConnectionRecord: class DidCommConnectionRecord {},
  DidCommCredentialExchangeRecord: class DidCommCredentialExchangeRecord {},
  DidCommProofExchangeRecord: class DidCommProofExchangeRecord {},
  DidCommCredentialState: { Done: 'done', OfferReceived: 'offer-received' },
  DidCommProofState: { RequestReceived: 'request-received' },
}))

jest.mock('@heka-wallet/shared', () => {
  const theme = { ChatTheme: { rightText: {}, rightTextHighlighted: {} }, ColorPalette: { brand: {} } }
  const logger = { error: jest.fn() }
  return {
    ColorPalette: {
      brand: { primaryBackground: 'pending-background' },
      grayscale: { black: 'black' },
      semantic: { successTransparent: 'success-background' },
    },
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
  EventTypes: {
    Credential: 'credential',
    CredentialOffer: 'credential-offer',
    PresentationRequest: 'presentation-request',
  },
}))
jest.mock('../../src/credentials', () => ({ resolveOverlay: jest.fn() }))

// The hook's module logger; the mock factory returns the same instance on every call.
const logger = GlobalLogger.createContextLogger('ChatMessages')
// The mock factory returns the same navigation object on every call.
const navigation = useNavigation()

const createConnection = (createdAt: Date) =>
  ({ id: 'connection-id', theirLabel: 'Issuer', createdAt }) as unknown as DidCommConnectionRecord

const createCredential = (
  state: DidCommCredentialState = DidCommCredentialState.Done,
  createdAt = new Date('2026-01-02T00:00:00Z')
) =>
  Object.assign(Object.create(DidCommCredentialExchangeRecord.prototype), {
    id: 'credential-id',
    type: 'CredentialRecord',
    state,
    createdAt,
  })

const createProof = (state: DidCommProofState) =>
  Object.assign(Object.create(DidCommProofExchangeRecord.prototype), {
    id: 'proof-id',
    type: 'ProofRecord',
    state,
    createdAt: new Date('2026-01-03T00:00:00Z'),
  })

const openEvent = (message: ExtendedChatMessage) => {
  if (message.content.kind !== 'event') throw new Error(`Expected an event, got ${message.content.kind}`)
  message.content.onPress()
}

describe('useChatMessagesByConnection', () => {
  afterEach(() => {
    mockBasicMessages = []
    mockCredentials = []
    mockProofs = []
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

  it('returns a basic message as text and link segments, an email address as mailto', async () => {
    mockFunction(getMessageEventRole).mockReturnValue(Role.them)
    const createdAt = new Date('2026-03-01T00:00:00Z')
    mockBasicMessages = [{ id: 'message-id', content: 'See https://heka.example/a or mail me@heka.example', createdAt }]

    const { result } = renderHook(() => useChatMessagesByConnection(createConnection(new Date('2026-01-01T00:00:00Z'))))
    await waitFor(() => expect(result.current).toHaveLength(2))

    expect(result.current[0].content).toEqual({
      kind: 'text',
      segments: [
        { text: 'See ' },
        { text: 'https://heka.example/a', link: 'https://heka.example/a' },
        { text: ' or mail ' },
        { text: 'me@heka.example', link: 'mailto:me@heka.example' },
        { text: '' },
      ],
    })
    expect(result.current[1].content).toEqual({ kind: 'connected', label: 'Issuer' })
  })

  it('links a URL and an email address whose host has a hyphen', async () => {
    mockFunction(getMessageEventRole).mockReturnValue(Role.them)
    mockBasicMessages = [
      {
        id: 'message-id',
        content: 'Open https://my-issuer.example/a or mail me@my-issuer.example',
        createdAt: new Date(),
      },
    ]

    const { result } = renderHook(() => useChatMessagesByConnection(createConnection(new Date('2026-01-01T00:00:00Z'))))
    await waitFor(() => expect(result.current).toHaveLength(2))

    expect(result.current[0].content).toEqual({
      kind: 'text',
      segments: [
        { text: 'Open ' },
        { text: 'https://my-issuer.example/a', link: 'https://my-issuer.example/a' },
        { text: ' or mail ' },
        { text: 'me@my-issuer.example', link: 'mailto:me@my-issuer.example' },
        { text: '' },
      ],
    })
  })

  it('links the whole email address when a later host label has a hyphen', async () => {
    mockFunction(getMessageEventRole).mockReturnValue(Role.them)
    mockBasicMessages = [{ id: 'message-id', content: 'Mail me@mail.my-issuer.example', createdAt: new Date() }]

    const { result } = renderHook(() => useChatMessagesByConnection(createConnection(new Date('2026-01-01T00:00:00Z'))))
    await waitFor(() => expect(result.current).toHaveLength(2))

    expect(result.current[0].content).toEqual({
      kind: 'text',
      segments: [
        { text: 'Mail ' },
        { text: 'me@mail.my-issuer.example', link: 'mailto:me@mail.my-issuer.example' },
        { text: '' },
      ],
    })
  })

  it('returns a done credential as an accepted credential event', async () => {
    const connection = Object.assign(createConnection(new Date('2026-01-01T00:00:00Z')), {
      imageUrl: 'https://issuer.example/logo.png',
    })
    mockCredentials = [createCredential()]
    mockFunction(resolveOverlay).mockResolvedValue({} as never)

    const { result } = renderHook(() => useChatMessagesByConnection(connection))
    await waitFor(() => expect(result.current).toHaveLength(2))

    const successStyles = { backgroundColor: 'success-background', fontColor: 'black' }
    expect(result.current[0]).toMatchObject({
      _id: 'credential-id',
      text: 'CredentialRecord',
      content: {
        kind: 'event',
        event: {
          role: Role.me,
          type: 'credential',
          state: 'accepted',
          image: 'https://issuer.example/logo.png',
          styles: successStyles,
        },
        onPress: expect.any(Function),
      },
      eventStyles: successStyles,
      user: { _id: Role.me },
    })
  })

  it('opens the credential details when a done credential event is pressed', async () => {
    const credential = createCredential()
    mockCredentials = [credential]
    mockFunction(resolveOverlay).mockResolvedValue({} as never)

    const { result } = renderHook(() => useChatMessagesByConnection(createConnection(new Date('2026-01-01T00:00:00Z'))))
    await waitFor(() => expect(result.current).toHaveLength(2))

    openEvent(result.current[0])

    expect(navigation.navigate).toBeCalledTimes(1)
    expect(navigation.navigate).toBeCalledWith('ContactStack', {
      screen: 'CredentialDetails',
      params: { credential },
    })
  })

  it('opens the credential offer when a received offer event is pressed', async () => {
    mockCredentials = [createCredential(DidCommCredentialState.OfferReceived)]
    mockFunction(resolveOverlay).mockResolvedValue({} as never)

    const { result } = renderHook(() => useChatMessagesByConnection(createConnection(new Date('2026-01-01T00:00:00Z'))))
    await waitFor(() => expect(result.current).toHaveLength(2))

    openEvent(result.current[0])

    expect(navigation.navigate).toBeCalledTimes(1)
    expect(navigation.navigate).toBeCalledWith('NotificationStack', {
      screen: 'CredentialOffer',
      params: { credentialId: 'credential-id' },
    })
  })

  it('opens the proof request when a received proof request event is pressed', async () => {
    mockProofs = [createProof(DidCommProofState.RequestReceived)]

    const { result } = renderHook(() => useChatMessagesByConnection(createConnection(new Date('2026-01-01T00:00:00Z'))))
    await waitFor(() => expect(result.current).toHaveLength(2))

    openEvent(result.current[0])

    expect(navigation.navigate).toBeCalledTimes(1)
    expect(navigation.navigate).toBeCalledWith('NotificationStack', {
      screen: 'ProofRequest',
      params: { proofId: 'proof-id' },
    })
  })

  it('orders messages and events newest first with the connected message last', async () => {
    mockFunction(getMessageEventRole).mockReturnValue(Role.them)
    mockFunction(resolveOverlay).mockResolvedValue({} as never)
    mockBasicMessages = [
      { id: 'oldest-message', content: 'First', createdAt: new Date('2026-01-02T00:00:00Z') },
      { id: 'newest-message', content: 'Last', createdAt: new Date('2026-01-05T00:00:00Z') },
    ]
    mockCredentials = [createCredential(DidCommCredentialState.Done, new Date('2026-01-04T00:00:00Z'))]
    mockProofs = [createProof(DidCommProofState.RequestReceived)]

    const { result } = renderHook(() => useChatMessagesByConnection(createConnection(new Date('2026-01-01T00:00:00Z'))))
    await waitFor(() => expect(result.current).toHaveLength(5))

    expect(result.current.map((message) => message._id)).toEqual([
      'newest-message',
      'credential-id',
      'proof-id',
      'oldest-message',
      'connected',
    ])
  })
})
