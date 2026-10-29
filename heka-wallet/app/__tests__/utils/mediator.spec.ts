import { GlobalLogger } from '@heka-wallet/shared'

import { MEDIATOR_CONNECTION_TIMEOUT_MS, trySetupMediator } from '../../src/utils/mediator'
import type { HekaWalletAgent } from '../../src/utils/agent'

const mockInvitationUrl = 'https://mediator.example/invite?oob=abc'
const mockMediatorPublicDid = 'did:web:mediator.example'
const mockInvitation = { id: 'invitation-id' }
const mockRouting = { endpoints: ['didcomm:transport/queue'] }
const mockMediationRecord = { id: 'mediation-id', state: 'granted', isReady: true }
const requestedMediationRecord = { id: 'requested-mediation-id', state: 'requested', isReady: false }
const readyConnection = { id: 'ready-connection-id', isReady: true }
const pendingConnection = { id: 'pending-connection-id', isReady: false }

const mediationRepository = { delete: jest.fn() }

const mockAgent = {
  context: {},
  dependencyManager: { resolve: () => mediationRepository },
  didcomm: {
    mediationRecipient: {
      findDefaultMediator: jest.fn(),
      findByConnectionId: jest.fn(),
      getRouting: jest.fn(),
      provision: jest.fn(),
      setDefaultMediator: jest.fn(),
      initiateMessagePickup: jest.fn(),
    },
    oob: {
      parseInvitation: jest.fn(),
      findByReceivedInvitationId: jest.fn(),
      receiveInvitation: jest.fn(),
      receiveImplicitInvitation: jest.fn(),
      deleteById: jest.fn(),
    },
    connections: {
      findAllByOutOfBandId: jest.fn(),
      returnWhenIsConnected: jest.fn(),
      deleteById: jest.fn(),
    },
  },
}

const agent = mockAgent as unknown as HekaWalletAgent
const { mediationRecipient, oob, connections } = mockAgent.didcomm
const loggerWarn = GlobalLogger.createContextLogger('Mediator').warn

describe('trySetupMediator', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Like Credo: a fresh grant in provision() becomes the default mediator.
    let defaultMediator: unknown = null
    mediationRecipient.findDefaultMediator.mockImplementation(async () => defaultMediator)
    mediationRecipient.setDefaultMediator.mockImplementation(async (record) => {
      defaultMediator = record
    })
    mediationRecipient.findByConnectionId.mockResolvedValue(null)
    mediationRecipient.getRouting.mockResolvedValue(mockRouting)
    mediationRecipient.provision.mockImplementation(async () => {
      defaultMediator = mockMediationRecord
      return mockMediationRecord
    })
    mediationRecipient.initiateMessagePickup.mockResolvedValue(undefined)
    oob.parseInvitation.mockResolvedValue(mockInvitation)
    oob.findByReceivedInvitationId.mockResolvedValue(null)
    oob.receiveInvitation.mockResolvedValue({ connectionRecord: pendingConnection })
    oob.receiveImplicitInvitation.mockResolvedValue({ connectionRecord: pendingConnection })
    connections.findAllByOutOfBandId.mockResolvedValue([])
    connections.returnWhenIsConnected.mockResolvedValue(readyConnection)
  })

  it('returns true without network calls when a default mediator already exists', async () => {
    mediationRecipient.findDefaultMediator.mockResolvedValue(mockMediationRecord)

    await expect(trySetupMediator(agent, { invitationUrl: mockInvitationUrl })).resolves.toBe(true)

    expect(oob.receiveInvitation).not.toHaveBeenCalled()
    expect(mediationRecipient.provision).not.toHaveBeenCalled()
  })

  it('connects with the invitation URL, provisions mediation and starts pickup', async () => {
    await expect(trySetupMediator(agent, { invitationUrl: mockInvitationUrl })).resolves.toBe(true)

    expect(mediationRecipient.getRouting).toHaveBeenCalledWith({ useDefaultMediator: false })
    expect(oob.receiveInvitation).toHaveBeenCalledWith(mockInvitation, { label: '', routing: mockRouting })
    expect(connections.returnWhenIsConnected).toHaveBeenCalledWith(pendingConnection.id, {
      timeoutMs: MEDIATOR_CONNECTION_TIMEOUT_MS,
    })
    expect(mediationRecipient.provision).toHaveBeenCalledWith(readyConnection)
    expect(mediationRecipient.initiateMessagePickup).toHaveBeenCalledWith(mockMediationRecord)
  })

  it('returns false and logs a warning when the mediator is unreachable', async () => {
    oob.receiveInvitation.mockRejectedValue(new Error('Message is undeliverable to connection'))

    await expect(trySetupMediator(agent, { invitationUrl: mockInvitationUrl })).resolves.toBe(false)

    expect(mediationRecipient.provision).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      'Mediator is unavailable, continuing without it:',
      expect.stringContaining('Message is undeliverable')
    )
  })

  it('returns false when the mediator connection times out', async () => {
    connections.returnWhenIsConnected.mockRejectedValue(new Error('Timeout'))

    await expect(trySetupMediator(agent, { invitationUrl: mockInvitationUrl })).resolves.toBe(false)

    expect(mediationRecipient.provision).not.toHaveBeenCalled()
  })

  it('reuses a ready connection from an earlier start', async () => {
    oob.findByReceivedInvitationId.mockResolvedValue({ id: 'oob-id' })
    connections.findAllByOutOfBandId.mockResolvedValue([readyConnection])

    await expect(trySetupMediator(agent, { invitationUrl: mockInvitationUrl })).resolves.toBe(true)

    expect(oob.receiveInvitation).not.toHaveBeenCalled()
    expect(mediationRecipient.provision).toHaveBeenCalledWith(readyConnection)
  })

  it('requests mediation again when a grant timed out on a reused connection', async () => {
    oob.findByReceivedInvitationId.mockResolvedValue({ id: 'oob-id' })
    connections.findAllByOutOfBandId.mockResolvedValue([readyConnection])
    mediationRecipient.findByConnectionId.mockResolvedValue(requestedMediationRecord)

    await expect(trySetupMediator(agent, { invitationUrl: mockInvitationUrl })).resolves.toBe(true)

    expect(mediationRepository.delete).toHaveBeenCalledWith(mockAgent.context, requestedMediationRecord)
    expect(mediationRecipient.provision).toHaveBeenCalledWith(readyConnection)
  })

  it('returns false without starting pickup when provisioning leaves mediation ungranted', async () => {
    mediationRecipient.provision.mockResolvedValue(requestedMediationRecord)

    await expect(trySetupMediator(agent, { invitationUrl: mockInvitationUrl })).resolves.toBe(false)

    expect(mediationRecipient.initiateMessagePickup).not.toHaveBeenCalled()
  })

  it('sets a grant that arrived after the timeout as the default mediator', async () => {
    mediationRecipient.findByConnectionId.mockResolvedValue(mockMediationRecord)
    // provision() returns an existing record as is and sets no default.
    mediationRecipient.provision.mockResolvedValue(mockMediationRecord)

    await expect(trySetupMediator(agent, { invitationUrl: mockInvitationUrl })).resolves.toBe(true)

    expect(mediationRepository.delete).not.toHaveBeenCalled()
    expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledWith(mockMediationRecord)
  })

  it('deletes a connection left unfinished by a failed start and connects again', async () => {
    oob.findByReceivedInvitationId.mockResolvedValue({ id: 'oob-id' })
    connections.findAllByOutOfBandId.mockResolvedValue([pendingConnection])

    await expect(trySetupMediator(agent, { invitationUrl: mockInvitationUrl })).resolves.toBe(true)

    expect(connections.deleteById).toHaveBeenCalledWith(pendingConnection.id)
    expect(oob.deleteById).toHaveBeenCalledWith('oob-id')
    expect(oob.receiveInvitation).toHaveBeenCalledTimes(1)
  })

  it('connects with the mediator public DID when no invitation URL is set', async () => {
    await expect(trySetupMediator(agent, { publicDid: mockMediatorPublicDid })).resolves.toBe(true)

    expect(oob.receiveImplicitInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ did: mockMediatorPublicDid, autoAcceptConnection: true })
    )
    expect(mediationRecipient.provision).toHaveBeenCalledWith(readyConnection)
  })

  it('returns false when no mediator is configured', async () => {
    await expect(trySetupMediator(agent, {})).resolves.toBe(false)

    expect(oob.receiveInvitation).not.toHaveBeenCalled()
    expect(oob.receiveImplicitInvitation).not.toHaveBeenCalled()
  })
})
