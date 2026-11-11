import type {
  GetRevocationStatusListReturn,
  RegisterRevocationStatusListOptions,
  RegisterRevocationStatusListReturn,
} from '@credo-ts/anoncreds'
import type { AgentContext } from '@credo-ts/core'

import { HederaAnonCredsRegistry } from '@credo-ts/hedera'

// Regression test for the yarn patch on @credo-ts/hedera (.yarn/patches/@credo-ts-hedera-npm-*.patch, from #247).
// The Hedera SDK works with millisecond timestamps while AnonCreds uses seconds. The patched registry asks the
// ledger for `timestamp * 1000` and converts status list timestamps it returns back to seconds. If a Credo bump
// drops or breaks the patch, these tests fail.
describe('HederaAnonCredsRegistry revocation status list timestamps (patched @credo-ts/hedera)', () => {
  const issuerId = 'did:hedera:testnet:zExample_0.0.1'
  const revRegDefId = `${issuerId}/anoncreds/v0/REV_REG/0.0.2`
  const seconds = 1_761_830_000
  const millis = seconds * 1000

  const statusList = (timestamp: number) => ({
    issuerId,
    revRegDefId,
    revocationList: [0, 1, 0],
    currentAccumulator: '21 ABC',
    timestamp,
  })

  const anonCredsService = {
    getRevocationStatusList:
      vi.fn<(ctx: AgentContext, id: string, timestamp: number) => Promise<GetRevocationStatusListReturn>>(),
    registerRevocationStatusList:
      vi.fn<
        (ctx: AgentContext, options: RegisterRevocationStatusListOptions) => Promise<RegisterRevocationStatusListReturn>
      >(),
  }
  const resolve = vi.fn()
  const logger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const agentContext = { config: { logger }, dependencyManager: { resolve } } as unknown as AgentContext

  let registry: HederaAnonCredsRegistry

  beforeEach(() => {
    vi.resetAllMocks()
    resolve.mockReturnValue(anonCredsService)
    registry = new HederaAnonCredsRegistry()
  })

  afterEach(() => {
    // The registry catches errors and returns a failed result; a logged error means the call under test threw.
    expect(logger.error).not.toHaveBeenCalled()
    // The registry must go through HederaAnonCredsService (the class is the DI token, it is not exported).
    for (const [token] of resolve.mock.calls) {
      expect((token as { name?: string }).name).toBe('HederaAnonCredsService')
    }
  })

  describe('getRevocationStatusList', () => {
    test('queries the ledger in milliseconds and returns the status list timestamp in seconds', async () => {
      // The ledger returns the latest entry at or before the requested time, with millisecond precision.
      const serviceList = statusList(millis + 789)
      const serviceResult: GetRevocationStatusListReturn = {
        revocationStatusList: serviceList,
        resolutionMetadata: {},
        revocationStatusListMetadata: { previousVersionId: '', nextVersionId: '' },
      }
      const snapshot = structuredClone(serviceResult)
      anonCredsService.getRevocationStatusList.mockResolvedValue(serviceResult)

      const result = await registry.getRevocationStatusList(agentContext, revRegDefId, seconds)

      expect(anonCredsService.getRevocationStatusList).toHaveBeenCalledTimes(1)
      expect(anonCredsService.getRevocationStatusList).toHaveBeenCalledWith(agentContext, revRegDefId, millis)
      expect(result).toEqual({
        ...snapshot,
        revocationStatusList: { ...snapshot.revocationStatusList, timestamp: seconds },
      })
      expect(Number.isInteger(result.revocationStatusList?.timestamp)).toBe(true)
      // The patch replaces the list with a converted copy; the object the service returned is left as is.
      expect(serviceList).toEqual(snapshot.revocationStatusList)
    })

    test('a returned timestamp passed back in requests the same milliseconds', async () => {
      anonCredsService.getRevocationStatusList.mockImplementation((_ctx, _id, requested) =>
        Promise.resolve({
          revocationStatusList: statusList(requested),
          resolutionMetadata: {},
          revocationStatusListMetadata: {},
        }),
      )

      const first = await registry.getRevocationStatusList(agentContext, revRegDefId, seconds)
      await registry.getRevocationStatusList(agentContext, revRegDefId, first.revocationStatusList!.timestamp)

      expect(first.revocationStatusList?.timestamp).toBe(seconds)
      expect(anonCredsService.getRevocationStatusList.mock.calls.map(([, , timestamp]) => timestamp)).toEqual([
        millis,
        millis,
      ])
    })

    test('returns a result without a status list unchanged', async () => {
      const serviceResult: GetRevocationStatusListReturn = {
        resolutionMetadata: { error: 'notFound', message: 'not found' },
        revocationStatusListMetadata: {},
      }
      const snapshot = structuredClone(serviceResult)
      anonCredsService.getRevocationStatusList.mockResolvedValue(serviceResult)

      const result = await registry.getRevocationStatusList(agentContext, revRegDefId, seconds)

      expect(anonCredsService.getRevocationStatusList).toHaveBeenCalledWith(agentContext, revRegDefId, millis)
      expect(result).toBe(serviceResult)
      expect(result).toEqual(snapshot)
      expect(result).not.toHaveProperty('revocationStatusList')
    })
  })

  describe('registerRevocationStatusList', () => {
    const options: RegisterRevocationStatusListOptions = {
      revocationStatusList: { issuerId, revRegDefId, revocationList: [0, 0, 0], currentAccumulator: '21 ABC' },
      options: {},
    }

    test('returns the status list timestamp of a finished registration in seconds', async () => {
      const serviceList = statusList(millis + 456)
      const serviceResult: RegisterRevocationStatusListReturn = {
        jobId: 'job-1',
        revocationStatusListState: { state: 'finished', revocationStatusList: serviceList },
        registrationMetadata: { transactionId: 'tx' },
        revocationStatusListMetadata: {},
      }
      const snapshot = structuredClone(serviceResult)
      anonCredsService.registerRevocationStatusList.mockResolvedValue(serviceResult)

      const result = await registry.registerRevocationStatusList(agentContext, options)

      expect(anonCredsService.registerRevocationStatusList).toHaveBeenCalledWith(agentContext, options)
      expect(result).toEqual({
        ...snapshot,
        revocationStatusListState: {
          state: 'finished',
          revocationStatusList: { ...statusList(millis + 456), timestamp: seconds },
        },
      })
      expect(serviceList).toEqual(snapshot.revocationStatusListState.revocationStatusList)
    })

    test.each([
      ['failed', { state: 'failed', reason: 'ledger error', revocationStatusList: statusList(millis) }] as const,
      ['wait', { state: 'wait', revocationStatusList: statusList(millis) }] as const,
      ['action', { state: 'action', action: 'sign', revocationStatusList: statusList(millis) }] as const,
    ])('returns a %s registration unchanged', async (_, revocationStatusListState) => {
      const serviceResult = {
        revocationStatusListState,
        registrationMetadata: {},
        revocationStatusListMetadata: {},
      } as unknown as RegisterRevocationStatusListReturn
      const snapshot = structuredClone(serviceResult)
      anonCredsService.registerRevocationStatusList.mockResolvedValue(serviceResult)

      const result = await registry.registerRevocationStatusList(agentContext, options)

      expect(result).toBe(serviceResult)
      expect(result).toEqual(snapshot)
    })
  })
})
