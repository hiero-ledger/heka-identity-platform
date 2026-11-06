import { DidDocumentRole, DidRecord } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { didRecordStub, didResolutionResultStub } from '../../../../test/helpers/mock-records'
import { assertDidActiveOnLedger } from '../did-deactivation'

describe('assertDidActiveOnLedger', () => {
  const did = 'did:hedera:testnet:z6Mk_0.0.1'

  let tenantAgent: TenantAgent
  let didRepository: { update: ReturnType<typeof vi.fn> }

  const deactivatedRecord = () => didRecordStub({ did, getTag: (name: string) => name === 'hekaDeactivated' })

  beforeEach(() => {
    didRepository = { update: vi.fn() }
    tenantAgent = createMock<TenantAgent>({
      dids: {
        getCreatedDids: vi.fn().mockResolvedValue([]),
        resolve: vi.fn().mockResolvedValue(didResolutionResultStub({ didDocument: { id: did } })),
      },
      dependencyManager: { resolve: vi.fn().mockReturnValue(didRepository) },
      config: { logger: { warn: vi.fn() } },
    })
  })

  test('passes for an active DID, asking the ledger uncached and not from the wallet record', async () => {
    await assertDidActiveOnLedger(tenantAgent, did)

    expect(tenantAgent.dids.resolve).toHaveBeenCalledWith(did, { useCache: false, useLocalCreatedDidRecord: false })
    expect(tenantAgent.dids.getCreatedDids).toHaveBeenCalledWith({ did })
  })

  test('rejects a DID the wallet deactivated with 422', async () => {
    vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([deactivatedRecord()])

    const check = assertDidActiveOnLedger(tenantAgent, did)

    await expect(check).rejects.toThrow(UnprocessableEntityException)
    await expect(check).rejects.toThrow(`DID is deactivated: ${did}`)
  })

  test('rejects a DID deactivated on its ledger but not by the wallet with 422, and tags the wallet record', async () => {
    const record = new DidRecord({ did, role: DidDocumentRole.Created })
    vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([record])
    vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
      didResolutionResultStub({ didDocument: { id: did }, didDocumentMetadata: { deactivated: true } }),
    )

    await expect(assertDidActiveOnLedger(tenantAgent, did)).rejects.toThrow(`DID is deactivated: ${did}`)
    expect(record.getTag('hekaDeactivated')).toBe(true)
    expect(didRepository.update).toHaveBeenCalledWith(tenantAgent.context, record)
  })

  test('rejects a DID deactivated on its ledger with 422 also when the wallet record cannot be tagged', async () => {
    vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([
      new DidRecord({ did, role: DidDocumentRole.Created }),
    ])
    vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
      didResolutionResultStub({ didDocumentMetadata: { deactivated: true } }),
    )
    didRepository.update.mockRejectedValue(new Error('storage unavailable'))

    await expect(assertDidActiveOnLedger(tenantAgent, did)).rejects.toThrow(UnprocessableEntityException)
    expect(tenantAgent.config.logger.warn).toHaveBeenCalledOnce()
  })

  test('falls back to the wallet tag when the resolver fails', async () => {
    vi.mocked(tenantAgent.dids.resolve).mockRejectedValue(new Error('resolver unavailable'))

    await assertDidActiveOnLedger(tenantAgent, did)
    expect(tenantAgent.config.logger.warn).toHaveBeenCalledOnce()

    vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([deactivatedRecord()])
    await expect(assertDidActiveOnLedger(tenantAgent, did)).rejects.toThrow(UnprocessableEntityException)
  })

  test('falls back to the wallet tag when the ledger cannot resolve the DID', async () => {
    vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
      didResolutionResultStub({ didResolutionMetadata: { error: 'notFound' } }),
    )

    await assertDidActiveOnLedger(tenantAgent, did)

    vi.mocked(tenantAgent.dids.getCreatedDids).mockResolvedValue([deactivatedRecord()])
    await expect(assertDidActiveOnLedger(tenantAgent, did)).rejects.toThrow(UnprocessableEntityException)
  })
})
