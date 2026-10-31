import { Agent } from '@credo-ts/core'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  createPublicInvitationOrGetExisting,
  createPublicInvitationWhenMediatorReady,
  getMediatorSource,
  MediatorSource,
  trySetupMediator,
} from '../../src/utils/agent'

// utils/agent.ts eagerly imports native/ESM Credo modules and agent setup helpers.
// Only the mediator and public invitation helpers are tested here, so the rest is mocked out.
jest.mock('@bifold/react-hooks', () => ({ useOptionalAgent: jest.fn() }))
jest.mock('@credo-ts/anoncreds', () => ({}))
// Only the out-of-band role enum is used at runtime by the mediator setup
jest.mock('@credo-ts/didcomm', () => ({ DidCommOutOfBandRole: { Receiver: 'receiver' } }))
jest.mock('@credo-ts/hedera', () => ({}))
jest.mock('@credo-ts/indy-vdr', () => ({}))
jest.mock('@hyperledger/anoncreds-react-native', () => ({ NativeAnoncreds: {} }))
jest.mock(
  '@credo-ts/didcomm/build/modules/connections/services/helpers.mjs',
  () => ({ createPeerDidFromServices: jest.fn(), routingToServices: jest.fn() }),
  { virtual: true }
)
jest.mock('../../src/credentials/metadata', () => ({ setOpenId4VcCredentialMetadata: jest.fn() }))
jest.mock('../../src/indy-besu', () => ({ IndyBesuDidResolver: jest.fn() }))
jest.mock('../../src/indy-besu/anoncreds', () => ({ IndyBesuAnoncredsRegistry: jest.fn() }))
jest.mock('../../src/logger', () => ({ CredoLogger: jest.fn() }))
jest.mock('../../src/utils/did', () => ({ getDidKeyVerificationMethodId: jest.fn() }))
jest.mock('../../src/utils/revocation/TailsService', () => ({ TailsService: jest.fn() }))

// Captured before any test fakes timers, to let Node report unhandled promise rejections
const realSetImmediate = setImmediate

const PUBLIC_DID_KEY = 'PUBLIC_DID'
const PUBLIC_INVITATION_ID_KEY = 'PUBLIC_INVITATION_ID'

const publicDid = 'did:peer:2.mock-public-did'
const mediatorInvitationUrl = 'https://mediator.example/invite?oob=mock'
const mediatorPublicDid = 'did:web:mediator.example'
const mediatorUrlSource: MediatorSource = { type: 'invitationUrl', invitationUrl: mediatorInvitationUrl }
const mediatorDidSource: MediatorSource = { type: 'publicDid', publicDid: mediatorPublicDid }
const label = 'Test Wallet'

const routedDidDocument = {
  didCommServices: [{ type: 'did-communication', routingKeys: ['did:key:mock-mediator-routing-key'] }],
}

const unroutedDidDocument = {
  didCommServices: [{ type: 'did-communication', routingKeys: [] }],
}

const mediatorOutOfBandInvitation = { id: 'mediator-invitation-id' }
const mediatorRouting = { endpoints: ['didcomm:transport/queue'], recipientKey: 'mock-recipient-key', routingKeys: [] }
const mediatorConnectionRecord = { id: 'mediator-connection-id', state: 'request-sent' }
const connectedMediatorConnectionRecord = { id: 'mediator-connection-id', state: 'completed' }
const mediationRecord = { id: 'mediation-record-id' }

interface MockAgentOptions {
  // Default mediator found on startup, null means the mediator has to be connected first
  defaultMediator?: { id: string } | null
}

function createMockAgent({ defaultMediator = { id: 'mediation-record-id' } }: MockAgentOptions = {}) {
  const invitationRecord = {
    id: 'new-invitation-id',
    outOfBandInvitation: { toUrl: jest.fn(() => 'didcomm://invite?oob=new') },
  }

  const mockAgent = {
    isInitialized: true,
    config: {
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    },
    dids: {
      resolveDidDocument: jest.fn().mockResolvedValue(routedDidDocument),
      getCreatedDids: jest.fn().mockResolvedValue([{ did: publicDid }]),
    },
    didcomm: {
      mediationRecipient: {
        // By default a default mediator already exists, so the mediator setup succeeds without connecting
        findDefaultMediator: jest.fn().mockResolvedValue(defaultMediator),
        getRouting: jest.fn().mockResolvedValue(mediatorRouting),
        requestAndAwaitGrant: jest.fn().mockResolvedValue(mediationRecord),
        setDefaultMediator: jest.fn().mockResolvedValue(undefined),
        initiateMessagePickup: jest.fn().mockResolvedValue(undefined),
      },
      oob: {
        createInvitation: jest.fn().mockResolvedValue(invitationRecord),
        findById: jest.fn(),
        parseInvitation: jest.fn().mockResolvedValue(mediatorOutOfBandInvitation),
        findByReceivedInvitationId: jest.fn().mockResolvedValue(null),
        receiveInvitation: jest.fn().mockResolvedValue({ connectionRecord: mediatorConnectionRecord }),
        findAllByQuery: jest.fn().mockResolvedValue([]),
        receiveImplicitInvitation: jest.fn().mockResolvedValue({ connectionRecord: mediatorConnectionRecord }),
        deleteById: jest.fn().mockResolvedValue(undefined),
      },
      connections: {
        returnWhenIsConnected: jest.fn().mockResolvedValue(connectedMediatorConnectionRecord),
        findAllByOutOfBandId: jest.fn().mockResolvedValue([]),
        deleteById: jest.fn().mockResolvedValue(undefined),
      },
    },
  }

  return { mockAgent, agent: mockAgent as unknown as Agent, invitationRecord }
}

describe('Agent utils', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  describe('createPublicInvitationOrGetExisting', () => {
    it('uses the public DID as invitation DID when it is routed through a mediator', async () => {
      const { mockAgent, agent } = createMockAgent()
      mockAgent.dids.resolveDidDocument.mockResolvedValueOnce(routedDidDocument)

      const invitationUrl = await createPublicInvitationOrGetExisting(agent, publicDid, label)

      expect(mockAgent.dids.resolveDidDocument).toHaveBeenCalledWith(publicDid)
      expect(mockAgent.didcomm.oob.createInvitation).toHaveBeenCalledTimes(1)
      expect(mockAgent.didcomm.oob.createInvitation).toHaveBeenCalledWith({
        label,
        invitationDid: publicDid,
        multiUseInvitation: true,
      })
      expect(await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)).toBe('new-invitation-id')
      expect(invitationUrl).toBe('didcomm://invite?oob=new')
    })

    it('does not reference the public DID when it is not routed through a mediator', async () => {
      const { mockAgent, agent } = createMockAgent()
      mockAgent.dids.resolveDidDocument.mockResolvedValueOnce(unroutedDidDocument)

      await createPublicInvitationOrGetExisting(agent, publicDid, label)

      expect(mockAgent.didcomm.oob.createInvitation).toHaveBeenCalledTimes(1)
      const [invitationConfig] = mockAgent.didcomm.oob.createInvitation.mock.calls[0]
      expect(invitationConfig.invitationDid).toBeUndefined()
      expect(invitationConfig.routing).toBeUndefined()
      expect(invitationConfig).toMatchObject({ label, multiUseInvitation: true })
      expect(await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)).toBe('new-invitation-id')
    })

    it('treats a DID document without DIDComm services as not routed through a mediator', async () => {
      const { mockAgent, agent } = createMockAgent()
      mockAgent.dids.resolveDidDocument.mockResolvedValueOnce({ didCommServices: [] })

      await createPublicInvitationOrGetExisting(agent, publicDid, label)

      const [invitationConfig] = mockAgent.didcomm.oob.createInvitation.mock.calls[0]
      expect(invitationConfig.invitationDid).toBeUndefined()
    })

    it('returns the existing invitation without creating a new one', async () => {
      const { mockAgent, agent } = createMockAgent()
      await AsyncStorage.setItem(PUBLIC_INVITATION_ID_KEY, 'existing-invitation-id')
      mockAgent.didcomm.oob.findById.mockResolvedValueOnce({
        id: 'existing-invitation-id',
        outOfBandInvitation: { toUrl: () => 'didcomm://invite?oob=existing' },
      })

      const invitationUrl = await createPublicInvitationOrGetExisting(agent, publicDid, label)

      expect(invitationUrl).toBe('didcomm://invite?oob=existing')
      expect(mockAgent.didcomm.oob.findById).toHaveBeenCalledWith('existing-invitation-id')
      expect(mockAgent.didcomm.oob.createInvitation).not.toHaveBeenCalled()
      expect(mockAgent.dids.resolveDidDocument).not.toHaveBeenCalled()
      expect(await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)).toBe('existing-invitation-id')
    })
  })

  describe('createPublicInvitationWhenMediatorReady', () => {
    it('creates the invitation for the stored public DID', async () => {
      const { mockAgent, agent } = createMockAgent()
      await AsyncStorage.setItem(PUBLIC_DID_KEY, publicDid)
      mockAgent.dids.resolveDidDocument.mockResolvedValueOnce(unroutedDidDocument)

      const invitationUrl = await createPublicInvitationWhenMediatorReady(agent, label)

      expect(invitationUrl).toBe('didcomm://invite?oob=new')
      expect(mockAgent.dids.getCreatedDids).toHaveBeenCalledWith({ method: 'peer', did: publicDid })
      expect(mockAgent.dids.resolveDidDocument).toHaveBeenCalledWith(publicDid)
      const [invitationConfig] = mockAgent.didcomm.oob.createInvitation.mock.calls[0]
      expect(invitationConfig.invitationDid).toBeUndefined()
    })

    it('shares one invitation creation between concurrent calls for the same agent', async () => {
      const { mockAgent, agent, invitationRecord } = createMockAgent()
      await AsyncStorage.setItem(PUBLIC_DID_KEY, publicDid)
      let resolveInvitation: (record: typeof invitationRecord) => void = () => undefined
      mockAgent.didcomm.oob.createInvitation.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveInvitation = resolve
        })
      )

      const firstCall = createPublicInvitationWhenMediatorReady(agent, label)
      const secondCall = createPublicInvitationWhenMediatorReady(agent, label)

      // Let the first call reach 'createInvitation' while the second one is still pending
      for (let i = 0; i < 50 && mockAgent.didcomm.oob.createInvitation.mock.calls.length === 0; i++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(mockAgent.didcomm.oob.createInvitation).toHaveBeenCalledTimes(1)
      resolveInvitation(invitationRecord)

      const [firstUrl, secondUrl] = await Promise.all([firstCall, secondCall])

      expect(firstUrl).toBe('didcomm://invite?oob=new')
      expect(secondUrl).toBe(firstUrl)
      expect(mockAgent.didcomm.oob.createInvitation).toHaveBeenCalledTimes(1)
      expect(mockAgent.dids.getCreatedDids).toHaveBeenCalledTimes(1)
      expect(await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)).toBe('new-invitation-id')
    })

    it('retries the creation on the next call after a failed one', async () => {
      const { mockAgent, agent } = createMockAgent()
      await AsyncStorage.setItem(PUBLIC_DID_KEY, publicDid)
      const error = new Error('Invitation creation failed')
      mockAgent.didcomm.oob.createInvitation.mockRejectedValueOnce(error)

      await expect(createPublicInvitationWhenMediatorReady(agent, label)).rejects.toBe(error)
      expect(await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)).toBeNull()

      const invitationUrl = await createPublicInvitationWhenMediatorReady(agent, label)

      expect(invitationUrl).toBe('didcomm://invite?oob=new')
      expect(mockAgent.didcomm.oob.createInvitation).toHaveBeenCalledTimes(2)
      expect(await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)).toBe('new-invitation-id')
    })
  })

  describe('trySetupMediator', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    it('runs the mediator ready callback before returning when the mediator is set up right away', async () => {
      const { agent } = createMockAgent()
      const onMediatorReady = jest.fn()

      await trySetupMediator(agent, mediatorUrlSource, onMediatorReady)

      expect(onMediatorReady).toHaveBeenCalledTimes(1)
    })

    it('connects to the mediator and sets it as default when there is no default mediator', async () => {
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { mediationRecipient, oob, connections } = mockAgent.didcomm
      const onMediatorReady = jest.fn()

      await trySetupMediator(agent, mediatorUrlSource, onMediatorReady)

      expect(oob.parseInvitation).toHaveBeenCalledWith(mediatorInvitationUrl)
      expect(oob.findByReceivedInvitationId).toHaveBeenCalledWith(mediatorOutOfBandInvitation.id)
      // Nothing to clean up from a previous attempt
      expect(connections.deleteById).not.toHaveBeenCalled()
      expect(oob.deleteById).not.toHaveBeenCalled()

      // The current default mediator must not be used to connect to the mediator
      expect(mediationRecipient.getRouting).toHaveBeenCalledWith({ useDefaultMediator: false })
      expect(oob.receiveInvitation).toHaveBeenCalledTimes(1)
      expect(oob.receiveInvitation).toHaveBeenCalledWith(mediatorOutOfBandInvitation, {
        label: '',
        alias: 'Mediator',
        routing: mediatorRouting,
      })
      expect(connections.returnWhenIsConnected).toHaveBeenCalledWith(mediatorConnectionRecord.id, {
        timeoutMs: expect.any(Number),
      })

      // Mediation is requested over the connected connection, not the one returned by 'receiveInvitation'
      expect(mediationRecipient.requestAndAwaitGrant).toHaveBeenCalledWith(
        connectedMediatorConnectionRecord,
        expect.any(Number)
      )
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledWith(mediationRecord)
      expect(mediationRecipient.initiateMessagePickup).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.initiateMessagePickup).toHaveBeenCalledWith(mediationRecord)

      // The mediator is set as default before message pickup starts and before the callback runs
      const setDefaultOrder = mediationRecipient.setDefaultMediator.mock.invocationCallOrder[0]
      expect(setDefaultOrder).toBeLessThan(mediationRecipient.initiateMessagePickup.mock.invocationCallOrder[0])
      expect(setDefaultOrder).toBeLessThan(onMediatorReady.mock.invocationCallOrder[0])

      expect(onMediatorReady).toHaveBeenCalledTimes(1)
      expect(mockAgent.config.logger.warn).not.toHaveBeenCalled()
      // The implicit invitation path is not used for an invitation URL
      expect(oob.findAllByQuery).not.toHaveBeenCalled()
      expect(oob.receiveImplicitInvitation).not.toHaveBeenCalled()
    })

    it('does not connect to the mediator when the default mediator already exists', async () => {
      const { mockAgent, agent } = createMockAgent()

      await trySetupMediator(agent, mediatorUrlSource)

      expect(mockAgent.didcomm.oob.parseInvitation).not.toHaveBeenCalled()
      expect(mockAgent.didcomm.oob.receiveInvitation).not.toHaveBeenCalled()
      expect(mockAgent.didcomm.mediationRecipient.requestAndAwaitGrant).not.toHaveBeenCalled()
      expect(mockAgent.didcomm.mediationRecipient.setDefaultMediator).not.toHaveBeenCalled()
      expect(mockAgent.didcomm.mediationRecipient.initiateMessagePickup).not.toHaveBeenCalled()
    })

    it('deletes the leftovers of a previous failed attempt before receiving the mediator invitation', async () => {
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { oob, connections } = mockAgent.didcomm
      oob.findByReceivedInvitationId.mockResolvedValueOnce({ id: 'previous-oob-record-id' })
      connections.findAllByOutOfBandId.mockResolvedValueOnce([
        { id: 'previous-connection-id-1' },
        { id: 'previous-connection-id-2' },
      ])

      await trySetupMediator(agent, mediatorUrlSource)

      expect(oob.findByReceivedInvitationId).toHaveBeenCalledWith(mediatorOutOfBandInvitation.id)
      expect(connections.findAllByOutOfBandId).toHaveBeenCalledWith('previous-oob-record-id')
      expect(connections.deleteById).toHaveBeenCalledTimes(2)
      expect(connections.deleteById).toHaveBeenNthCalledWith(1, 'previous-connection-id-1')
      expect(connections.deleteById).toHaveBeenNthCalledWith(2, 'previous-connection-id-2')
      expect(oob.deleteById).toHaveBeenCalledTimes(1)
      expect(oob.deleteById).toHaveBeenCalledWith('previous-oob-record-id')

      // Cleanup happens before the invitation is received again
      const receiveOrder = oob.receiveInvitation.mock.invocationCallOrder[0]
      expect(oob.deleteById.mock.invocationCallOrder[0]).toBeLessThan(receiveOrder)
      for (const order of connections.deleteById.mock.invocationCallOrder) {
        expect(order).toBeLessThan(receiveOrder)
      }
      expect(mockAgent.didcomm.mediationRecipient.setDefaultMediator).toHaveBeenCalledWith(mediationRecord)
    })

    it.each([
      [
        'the connection times out',
        (mockAgent: ReturnType<typeof createMockAgent>['mockAgent']) =>
          mockAgent.didcomm.connections.returnWhenIsConnected.mockRejectedValueOnce(
            new Error('Timeout waiting for connection to be connected')
          ),
      ],
      [
        'the mediation grant fails',
        (mockAgent: ReturnType<typeof createMockAgent>['mockAgent']) =>
          mockAgent.didcomm.mediationRecipient.requestAndAwaitGrant.mockRejectedValueOnce(
            new Error('Mediation grant timed out')
          ),
      ],
    ])('retries the first-time mediator setup in background when %s', async (_, failFirstAttempt) => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { mediationRecipient, oob, connections } = mockAgent.didcomm
      const onMediatorReady = jest.fn()
      failFirstAttempt(mockAgent)
      // The second attempt finds the out-of-band record left by the first one
      oob.findByReceivedInvitationId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'first-attempt-oob-record-id' })
      connections.findAllByOutOfBandId.mockResolvedValueOnce([{ id: mediatorConnectionRecord.id }])

      await expect(trySetupMediator(agent, mediatorUrlSource, onMediatorReady)).resolves.toBeUndefined()

      expect(mockAgent.config.logger.warn).toHaveBeenCalledWith('Failed to set up mediator, will retry in background', {
        error: expect.any(Error),
      })
      expect(oob.receiveInvitation).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.setDefaultMediator).not.toHaveBeenCalled()
      expect(mediationRecipient.initiateMessagePickup).not.toHaveBeenCalled()
      expect(onMediatorReady).not.toHaveBeenCalled()

      await jest.advanceTimersByTimeAsync(5000)

      // The background attempt cleans up the first attempt and connects again
      expect(oob.parseInvitation).toHaveBeenCalledTimes(2)
      expect(connections.deleteById).toHaveBeenCalledWith(mediatorConnectionRecord.id)
      expect(oob.deleteById).toHaveBeenCalledWith('first-attempt-oob-record-id')
      expect(oob.receiveInvitation).toHaveBeenCalledTimes(2)
      expect(oob.receiveInvitation).toHaveBeenLastCalledWith(mediatorOutOfBandInvitation, {
        label: '',
        alias: 'Mediator',
        routing: mediatorRouting,
      })
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledWith(mediationRecord)
      expect(mediationRecipient.initiateMessagePickup).toHaveBeenCalledWith(mediationRecord)
      expect(mockAgent.config.logger.info).toHaveBeenCalledWith('Mediator is set up')
      expect(onMediatorReady).toHaveBeenCalledTimes(1)

      // No further attempts or callback runs
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(oob.receiveInvitation).toHaveBeenCalledTimes(2)
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledTimes(1)
      expect(onMediatorReady).toHaveBeenCalledTimes(1)
    })

    it('times out a stalled mediator invitation lookup and retries it in background', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { mediationRecipient, oob } = mockAgent.didcomm
      const onMediatorReady = jest.fn()
      // The first lookup never settles, like a short invitation URL fetch that stalls
      oob.parseInvitation.mockReturnValueOnce(new Promise(() => undefined))

      let setupFinished = false
      const setup = trySetupMediator(agent, mediatorUrlSource, onMediatorReady).then(() => {
        setupFinished = true
      })

      await jest.advanceTimersByTimeAsync(15000 - 1)
      expect(setupFinished).toBe(false)

      await jest.advanceTimersByTimeAsync(1)
      expect(setupFinished).toBe(true)
      await setup

      expect(mockAgent.config.logger.warn).toHaveBeenCalledTimes(1)
      expect(mockAgent.config.logger.warn).toHaveBeenCalledWith('Failed to set up mediator, will retry in background', {
        error: new Error('Timed out resolving the mediator invitation URL'),
      })
      expect(oob.receiveInvitation).not.toHaveBeenCalled()
      expect(mediationRecipient.setDefaultMediator).not.toHaveBeenCalled()
      expect(onMediatorReady).not.toHaveBeenCalled()
      // Only the background retry is pending
      expect(jest.getTimerCount()).toBe(1)

      // The background retry starts a fresh attempt, and its lookup works
      await jest.advanceTimersByTimeAsync(5000)

      expect(oob.parseInvitation).toHaveBeenCalledTimes(2)
      expect(oob.receiveInvitation).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledWith(mediationRecord)
      expect(mockAgent.config.logger.info).toHaveBeenCalledWith('Mediator is set up')
      expect(onMediatorReady).toHaveBeenCalledTimes(1)
      // The deadline of the successful lookup is cleared
      expect(jest.getTimerCount()).toBe(0)
    })

    it('ignores a late rejection of a timed out mediator invitation lookup', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { mediationRecipient, oob } = mockAgent.didcomm
      let rejectLookup: (error: Error) => void = () => undefined
      oob.parseInvitation.mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectLookup = reject
        })
      )

      let setupFinished = false
      const setup = trySetupMediator(agent, mediatorUrlSource).then(() => {
        setupFinished = true
      })
      await jest.advanceTimersByTimeAsync(15000)
      expect(setupFinished).toBe(true)
      await setup

      rejectLookup(new Error('Network request failed'))
      // Give Node a chance to report an unhandled rejection: Jest fails the running test on one
      await new Promise((resolve) => realSetImmediate(resolve))
      await new Promise((resolve) => realSetImmediate(resolve))

      // The late rejection is not reported as another failed attempt
      expect(mockAgent.config.logger.warn).toHaveBeenCalledTimes(1)
      expect(oob.receiveInvitation).not.toHaveBeenCalled()
      expect(mediationRecipient.setDefaultMediator).not.toHaveBeenCalled()
    })

    it('clears the lookup deadline when the mediator invitation lookup fails right away', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { oob } = mockAgent.didcomm
      oob.parseInvitation.mockRejectedValueOnce(new Error('InvitationUrl is invalid'))

      await expect(trySetupMediator(agent, mediatorUrlSource)).resolves.toBeUndefined()

      expect(mockAgent.config.logger.warn).toHaveBeenCalledTimes(1)
      expect(mockAgent.config.logger.warn).toHaveBeenCalledWith('Failed to set up mediator, will retry in background', {
        error: new Error('InvitationUrl is invalid'),
      })
      expect(oob.receiveInvitation).not.toHaveBeenCalled()
      // Only the background retry is pending, the 15 s lookup deadline is cleared
      expect(jest.getTimerCount()).toBe(1)
    })

    it('shares one mediator connection attempt between concurrent setups for the same agent', async () => {
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { mediationRecipient, oob, connections } = mockAgent.didcomm
      let resolveConnection: (record: typeof connectedMediatorConnectionRecord) => void = () => undefined
      connections.returnWhenIsConnected.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveConnection = resolve
        })
      )
      const firstCallback = jest.fn()
      const secondCallback = jest.fn()

      const firstCall = trySetupMediator(agent, mediatorUrlSource, firstCallback)
      const secondCall = trySetupMediator(agent, mediatorUrlSource, secondCallback)

      // Let the first setup reach 'returnWhenIsConnected' while the second one is still pending
      for (let i = 0; i < 50 && connections.returnWhenIsConnected.mock.calls.length === 0; i++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(connections.returnWhenIsConnected).toHaveBeenCalledTimes(1)
      resolveConnection(connectedMediatorConnectionRecord)

      await Promise.all([firstCall, secondCall])

      expect(mediationRecipient.findDefaultMediator).toHaveBeenCalledTimes(1)
      expect(oob.parseInvitation).toHaveBeenCalledTimes(1)
      expect(oob.receiveInvitation).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.requestAndAwaitGrant).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.initiateMessagePickup).toHaveBeenCalledTimes(1)
      // Each caller still gets its callback once the shared attempt succeeds
      expect(firstCallback).toHaveBeenCalledTimes(1)
      expect(secondCallback).toHaveBeenCalledTimes(1)
    })

    it('runs a single background setup when it is requested again while already running', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent()
      const { findDefaultMediator } = mockAgent.didcomm.mediationRecipient
      const firstCallback = jest.fn()
      const secondCallback = jest.fn()
      // Both immediate attempts and the first background attempt fail
      findDefaultMediator
        .mockRejectedValueOnce(new Error('Mediator is not reachable'))
        .mockRejectedValueOnce(new Error('Mediator is not reachable'))
        .mockRejectedValueOnce(new Error('Mediator is not reachable'))

      await trySetupMediator(agent, mediatorUrlSource, firstCallback)
      await trySetupMediator(agent, mediatorUrlSource, secondCallback)
      expect(findDefaultMediator).toHaveBeenCalledTimes(2)
      expect(jest.getTimerCount()).toBe(1)

      // One background attempt per backoff step, not one per 'trySetupMediator' call
      await jest.advanceTimersByTimeAsync(5000)
      expect(findDefaultMediator).toHaveBeenCalledTimes(3)

      // Second background attempt (after the doubled delay) succeeds
      await jest.advanceTimersByTimeAsync(10000)
      expect(findDefaultMediator).toHaveBeenCalledTimes(4)

      // The second call did not register its callback, as the background setup was already running
      expect(firstCallback).toHaveBeenCalledTimes(1)
      expect(secondCallback).not.toHaveBeenCalled()

      await jest.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(findDefaultMediator).toHaveBeenCalledTimes(4)
    })

    it('starts a new background setup when it is requested again after the previous one succeeded', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent()
      const { findDefaultMediator } = mockAgent.didcomm.mediationRecipient
      const firstCallback = jest.fn()
      const secondCallback = jest.fn()
      findDefaultMediator.mockRejectedValueOnce(new Error('Mediator is not reachable'))

      // First background setup succeeds on its first attempt
      await trySetupMediator(agent, mediatorUrlSource, firstCallback)
      await jest.advanceTimersByTimeAsync(5000)
      expect(firstCallback).toHaveBeenCalledTimes(1)
      expect(jest.getTimerCount()).toBe(0)

      // A later immediate attempt fails again, so a new background setup is started
      findDefaultMediator.mockRejectedValueOnce(new Error('Mediator is not reachable'))
      await trySetupMediator(agent, mediatorUrlSource, secondCallback)
      expect(jest.getTimerCount()).toBe(1)

      await jest.advanceTimersByTimeAsync(5000)
      expect(findDefaultMediator).toHaveBeenCalledTimes(4)
      expect(secondCallback).toHaveBeenCalledTimes(1)
      expect(firstCallback).toHaveBeenCalledTimes(1)
    })

    it('stops the background setup once the agent is shut down', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { mediationRecipient, oob } = mockAgent.didcomm
      const onMediatorReady = jest.fn()
      oob.parseInvitation.mockRejectedValue(new Error('Mediator is not reachable'))

      await trySetupMediator(agent, mediatorUrlSource, onMediatorReady)
      expect(mediationRecipient.findDefaultMediator).toHaveBeenCalledTimes(1)
      expect(oob.parseInvitation).toHaveBeenCalledTimes(1)

      mockAgent.isInitialized = false
      await jest.advanceTimersByTimeAsync(60 * 60 * 1000)

      expect(mediationRecipient.findDefaultMediator).toHaveBeenCalledTimes(1)
      expect(oob.parseInvitation).toHaveBeenCalledTimes(1)
      expect(onMediatorReady).not.toHaveBeenCalled()
      expect(jest.getTimerCount()).toBe(0)
    })

    it('logs a mediator ready callback failure without throwing', async () => {
      const { mockAgent, agent } = createMockAgent()
      const error = new Error('Invitation creation failed')
      const onMediatorReady = jest.fn().mockRejectedValue(error)

      await expect(trySetupMediator(agent, mediatorUrlSource, onMediatorReady)).resolves.toBeUndefined()

      expect(onMediatorReady).toHaveBeenCalledTimes(1)
      expect(mockAgent.config.logger.error).toHaveBeenCalledWith(expect.any(String), { error })
    })

    it('runs the mediator ready callback once, after the background setup succeeds', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent()
      const onMediatorReady = jest.fn()
      mockAgent.didcomm.mediationRecipient.findDefaultMediator
        .mockRejectedValueOnce(new Error('Mediator is not reachable'))
        .mockRejectedValueOnce(new Error('Mediator is not reachable'))

      await trySetupMediator(agent, mediatorUrlSource, onMediatorReady)

      // Startup is not blocked and no callback yet, the setup continues in background
      expect(onMediatorReady).not.toHaveBeenCalled()

      // First background attempt fails
      await jest.advanceTimersByTimeAsync(5000)
      expect(mockAgent.didcomm.mediationRecipient.findDefaultMediator).toHaveBeenCalledTimes(2)
      expect(onMediatorReady).not.toHaveBeenCalled()

      // Second background attempt (after the doubled delay) succeeds
      await jest.advanceTimersByTimeAsync(10000)
      expect(mockAgent.didcomm.mediationRecipient.findDefaultMediator).toHaveBeenCalledTimes(3)
      expect(onMediatorReady).toHaveBeenCalledTimes(1)

      // No further attempts or callback runs
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(mockAgent.didcomm.mediationRecipient.findDefaultMediator).toHaveBeenCalledTimes(3)
      expect(onMediatorReady).toHaveBeenCalledTimes(1)
    })

    it('logs a callback failure after the background setup and does not retry the setup', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent()
      const error = new Error('Invitation creation failed')
      const onMediatorReady = jest.fn().mockRejectedValue(error)
      mockAgent.didcomm.mediationRecipient.findDefaultMediator.mockRejectedValueOnce(
        new Error('Mediator is not reachable')
      )

      await trySetupMediator(agent, mediatorUrlSource, onMediatorReady)
      await jest.advanceTimersByTimeAsync(5000)

      expect(onMediatorReady).toHaveBeenCalledTimes(1)
      expect(mockAgent.config.logger.error).toHaveBeenCalledWith(expect.any(String), { error })
      expect(mockAgent.config.logger.info).toHaveBeenCalledWith('Mediator is set up')

      // The callback failure is not treated as a mediator setup failure
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(mockAgent.didcomm.mediationRecipient.findDefaultMediator).toHaveBeenCalledTimes(2)
      expect(onMediatorReady).toHaveBeenCalledTimes(1)
    })

    it('creates the public invitation once the background setup succeeds', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent()
      await AsyncStorage.setItem(PUBLIC_DID_KEY, publicDid)
      mockAgent.dids.resolveDidDocument.mockResolvedValue(unroutedDidDocument)
      mockAgent.didcomm.mediationRecipient.findDefaultMediator.mockRejectedValueOnce(
        new Error('Mediator is not reachable')
      )

      await trySetupMediator(agent, mediatorUrlSource, async () => {
        await createPublicInvitationWhenMediatorReady(agent, label)
      })

      expect(mockAgent.didcomm.oob.createInvitation).not.toHaveBeenCalled()
      expect(await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)).toBeNull()

      await jest.advanceTimersByTimeAsync(5000)

      expect(mockAgent.didcomm.oob.createInvitation).toHaveBeenCalledTimes(1)
      const [invitationConfig] = mockAgent.didcomm.oob.createInvitation.mock.calls[0]
      expect(invitationConfig.invitationDid).toBeUndefined()
      expect(await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)).toBe('new-invitation-id')
    })
  })

  describe('trySetupMediator with a mediator public DID', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    it('connects to the mediator via an implicit invitation and sets it as default', async () => {
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { mediationRecipient, oob, connections } = mockAgent.didcomm
      const onMediatorReady = jest.fn()

      await trySetupMediator(agent, mediatorDidSource, onMediatorReady)

      expect(mockAgent.dids.resolveDidDocument).toHaveBeenCalledWith(mediatorPublicDid)
      expect(oob.findAllByQuery).toHaveBeenCalledWith({ invitationId: mediatorPublicDid, role: 'receiver' })
      // Nothing to clean up from a previous attempt
      expect(connections.deleteById).not.toHaveBeenCalled()
      expect(oob.deleteById).not.toHaveBeenCalled()

      // The current default mediator must not be used to connect to the mediator
      expect(mediationRecipient.getRouting).toHaveBeenCalledWith({ useDefaultMediator: false })
      expect(oob.receiveImplicitInvitation).toHaveBeenCalledTimes(1)
      expect(oob.receiveImplicitInvitation).toHaveBeenCalledWith({
        did: mediatorPublicDid,
        label: '',
        alias: 'Mediator',
        routing: mediatorRouting,
      })
      // The DID is resolved (with a deadline) before the invitation is received
      expect(mockAgent.dids.resolveDidDocument.mock.invocationCallOrder[0]).toBeLessThan(
        oob.receiveImplicitInvitation.mock.invocationCallOrder[0]
      )
      expect(oob.parseInvitation).not.toHaveBeenCalled()
      expect(oob.receiveInvitation).not.toHaveBeenCalled()

      expect(connections.returnWhenIsConnected).toHaveBeenCalledWith(mediatorConnectionRecord.id, {
        timeoutMs: expect.any(Number),
      })
      expect(mediationRecipient.requestAndAwaitGrant).toHaveBeenCalledWith(
        connectedMediatorConnectionRecord,
        expect.any(Number)
      )
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledWith(mediationRecord)
      expect(mediationRecipient.initiateMessagePickup).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.initiateMessagePickup).toHaveBeenCalledWith(mediationRecord)
      expect(mediationRecipient.setDefaultMediator.mock.invocationCallOrder[0]).toBeLessThan(
        onMediatorReady.mock.invocationCallOrder[0]
      )

      expect(onMediatorReady).toHaveBeenCalledTimes(1)
      expect(mockAgent.config.logger.warn).not.toHaveBeenCalled()
    })

    it('does not connect to the mediator when the default mediator already exists', async () => {
      const { mockAgent, agent } = createMockAgent()
      const onMediatorReady = jest.fn()

      await trySetupMediator(agent, mediatorDidSource, onMediatorReady)

      expect(mockAgent.dids.resolveDidDocument).not.toHaveBeenCalled()
      expect(mockAgent.didcomm.oob.receiveImplicitInvitation).not.toHaveBeenCalled()
      expect(mockAgent.didcomm.mediationRecipient.setDefaultMediator).not.toHaveBeenCalled()
      expect(onMediatorReady).toHaveBeenCalledTimes(1)
    })

    it('deletes all leftovers of previous failed attempts before receiving the implicit invitation', async () => {
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { oob, connections } = mockAgent.didcomm
      // Implicit invitations with the same id are not rejected, so there may be several leftover records
      oob.findAllByQuery.mockResolvedValueOnce([{ id: 'previous-oob-record-id-1' }, { id: 'previous-oob-record-id-2' }])
      connections.findAllByOutOfBandId
        .mockResolvedValueOnce([{ id: 'previous-connection-id-1' }])
        .mockResolvedValueOnce([{ id: 'previous-connection-id-2' }, { id: 'previous-connection-id-3' }])

      await trySetupMediator(agent, mediatorDidSource)

      expect(connections.findAllByOutOfBandId).toHaveBeenCalledTimes(2)
      expect(connections.findAllByOutOfBandId).toHaveBeenNthCalledWith(1, 'previous-oob-record-id-1')
      expect(connections.findAllByOutOfBandId).toHaveBeenNthCalledWith(2, 'previous-oob-record-id-2')
      expect(connections.deleteById.mock.calls).toEqual([
        ['previous-connection-id-1'],
        ['previous-connection-id-2'],
        ['previous-connection-id-3'],
      ])
      expect(oob.deleteById.mock.calls).toEqual([['previous-oob-record-id-1'], ['previous-oob-record-id-2']])

      // Cleanup happens before the invitation is received again
      const receiveOrder = oob.receiveImplicitInvitation.mock.invocationCallOrder[0]
      for (const order of [
        ...connections.deleteById.mock.invocationCallOrder,
        ...oob.deleteById.mock.invocationCallOrder,
      ]) {
        expect(order).toBeLessThan(receiveOrder)
      }
      expect(mockAgent.didcomm.mediationRecipient.setDefaultMediator).toHaveBeenCalledWith(mediationRecord)
      expect(mockAgent.config.logger.warn).not.toHaveBeenCalled()
    })

    it('times out a stalled mediator DID resolution and retries it in background', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { mediationRecipient, oob } = mockAgent.didcomm
      const onMediatorReady = jest.fn()
      // The first resolution never settles, like a 'did:web' fetch that stalls
      mockAgent.dids.resolveDidDocument.mockReturnValueOnce(new Promise(() => undefined))

      let setupFinished = false
      const setup = trySetupMediator(agent, mediatorDidSource, onMediatorReady).then(() => {
        setupFinished = true
      })

      await jest.advanceTimersByTimeAsync(15000 - 1)
      expect(setupFinished).toBe(false)

      await jest.advanceTimersByTimeAsync(1)
      expect(setupFinished).toBe(true)
      await setup

      expect(mockAgent.config.logger.warn).toHaveBeenCalledTimes(1)
      expect(mockAgent.config.logger.warn).toHaveBeenCalledWith('Failed to set up mediator, will retry in background', {
        error: new Error('Timed out resolving the mediator DID'),
      })
      expect(oob.findAllByQuery).not.toHaveBeenCalled()
      expect(oob.receiveImplicitInvitation).not.toHaveBeenCalled()
      expect(mediationRecipient.setDefaultMediator).not.toHaveBeenCalled()
      expect(onMediatorReady).not.toHaveBeenCalled()
      // Only the background retry is pending
      expect(jest.getTimerCount()).toBe(1)

      // The background retry starts a fresh attempt, and its resolution works
      await jest.advanceTimersByTimeAsync(5000)

      expect(mockAgent.dids.resolveDidDocument).toHaveBeenCalledTimes(2)
      expect(oob.receiveImplicitInvitation).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledWith(mediationRecord)
      expect(mockAgent.config.logger.info).toHaveBeenCalledWith('Mediator is set up')
      expect(onMediatorReady).toHaveBeenCalledTimes(1)
      // The deadline of the successful resolution is cleared
      expect(jest.getTimerCount()).toBe(0)
    })

    it('retries in background when the mediator DID cannot be resolved', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { oob } = mockAgent.didcomm
      const error = new Error('Unable to resolve did document for did')
      mockAgent.dids.resolveDidDocument.mockRejectedValueOnce(error)

      await expect(trySetupMediator(agent, mediatorDidSource)).resolves.toBeUndefined()

      expect(mockAgent.config.logger.warn).toHaveBeenCalledWith('Failed to set up mediator, will retry in background', {
        error,
      })
      expect(oob.receiveImplicitInvitation).not.toHaveBeenCalled()
      // Only the background retry is pending, the resolution deadline is cleared
      expect(jest.getTimerCount()).toBe(1)

      await jest.advanceTimersByTimeAsync(5000)
      expect(oob.receiveImplicitInvitation).toHaveBeenCalledTimes(1)
      expect(mockAgent.didcomm.mediationRecipient.setDefaultMediator).toHaveBeenCalledWith(mediationRecord)
    })

    it('cleans up the failed attempt and creates the public invitation once the background setup succeeds', async () => {
      jest.useFakeTimers()
      const { mockAgent, agent } = createMockAgent({ defaultMediator: null })
      const { mediationRecipient, oob, connections } = mockAgent.didcomm
      await AsyncStorage.setItem(PUBLIC_DID_KEY, publicDid)
      connections.returnWhenIsConnected.mockRejectedValueOnce(
        new Error('Timeout waiting for connection to be connected')
      )
      // The second attempt finds the out-of-band record left by the first one
      oob.findAllByQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'first-attempt-oob-record-id' }])
      connections.findAllByOutOfBandId.mockResolvedValueOnce([{ id: mediatorConnectionRecord.id }])

      await trySetupMediator(agent, mediatorDidSource, async () => {
        await createPublicInvitationWhenMediatorReady(agent, label)
      })

      expect(oob.receiveImplicitInvitation).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.setDefaultMediator).not.toHaveBeenCalled()
      expect(oob.createInvitation).not.toHaveBeenCalled()

      await jest.advanceTimersByTimeAsync(5000)

      expect(connections.deleteById).toHaveBeenCalledWith(mediatorConnectionRecord.id)
      expect(oob.deleteById).toHaveBeenCalledWith('first-attempt-oob-record-id')
      expect(oob.receiveImplicitInvitation).toHaveBeenCalledTimes(2)
      expect(mediationRecipient.setDefaultMediator).toHaveBeenCalledTimes(1)
      expect(mediationRecipient.initiateMessagePickup).toHaveBeenCalledWith(mediationRecord)

      // The public invitation is created the same way as with an invitation URL
      expect(oob.createInvitation).toHaveBeenCalledTimes(1)
      expect(oob.createInvitation).toHaveBeenCalledWith({ label, invitationDid: publicDid, multiUseInvitation: true })
      expect(await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)).toBe('new-invitation-id')

      // No further attempts
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(oob.receiveImplicitInvitation).toHaveBeenCalledTimes(2)
      expect(oob.createInvitation).toHaveBeenCalledTimes(1)
    })
  })

  describe('getMediatorSource', () => {
    const logger = { warn: jest.fn() }

    beforeEach(() => {
      logger.warn.mockClear()
    })

    it('uses the invitation URL when only MEDIATOR_URL is set', () => {
      expect(getMediatorSource({ mediatorUrl: mediatorInvitationUrl }, logger)).toEqual(mediatorUrlSource)
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('uses the public DID when only MEDIATOR_PUBLIC_DID is set', () => {
      expect(getMediatorSource({ mediatorUrl: '', mediatorPublicDid: mediatorPublicDid }, logger)).toEqual(
        mediatorDidSource
      )
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('uses the invitation URL and warns when both are set', () => {
      expect(
        getMediatorSource({ mediatorUrl: mediatorInvitationUrl, mediatorPublicDid: mediatorPublicDid }, logger)
      ).toEqual(mediatorUrlSource)
      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('MEDIATOR_PUBLIC_DID is ignored'))
    })

    it('returns undefined when neither is set', () => {
      expect(getMediatorSource({}, logger)).toBeUndefined()
      expect(getMediatorSource({ mediatorUrl: '', mediatorPublicDid: '' }, logger)).toBeUndefined()
      expect(logger.warn).not.toHaveBeenCalled()
    })
  })
})
