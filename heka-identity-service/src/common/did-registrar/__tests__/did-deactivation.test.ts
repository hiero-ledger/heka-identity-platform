import { DidDocumentRole, DidRecord } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { didRecordStub, didResolutionResultStub } from '../../../../test/helpers/mock-records'
import { assertDidActiveOnLedger, resolveActiveDidDocument } from '../did-deactivation'

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

describe('resolveActiveDidDocument', () => {
  const did = 'did:hedera:testnet:z6Mk_0.0.1'
  const LEDGER = { useCache: false, useLocalCreatedDidRecord: false }

  let tenantAgent: TenantAgent

  beforeEach(() => {
    tenantAgent = createMock<TenantAgent>({
      dids: {
        getCreatedDids: vi.fn().mockResolvedValue([]),
        resolve: vi.fn(),
      },
      dependencyManager: { resolve: vi.fn().mockReturnValue({ update: vi.fn() }) },
      config: { logger: { warn: vi.fn() } },
    })
  })

  test('returns the ledger document from one uncached read', async () => {
    vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
      didResolutionResultStub({ didDocument: { id: did, verificationMethod: [{ id: `${did}#ledger` }] } }),
    )

    const didDocument = await resolveActiveDidDocument(tenantAgent, did)

    expect(didDocument?.verificationMethod?.[0].id).toBe(`${did}#ledger`)
    expect(tenantAgent.dids.resolve).toHaveBeenCalledExactlyOnceWith(did, LEDGER)
  })

  test.each([
    ['throws', () => Promise.reject(new Error('mirror node unreachable'))],
    ['has no document', () => Promise.resolve(didResolutionResultStub({ didDocument: null }))],
  ])("falls back to the wallet's view when the ledger read %s", async (_label, ledgerRead) => {
    vi.mocked(tenantAgent.dids.resolve)
      .mockImplementationOnce(ledgerRead)
      .mockResolvedValueOnce(
        didResolutionResultStub({ didDocument: { id: did, verificationMethod: [{ id: `${did}#local` }] } }),
      )

    const didDocument = await resolveActiveDidDocument(tenantAgent, did)

    expect(didDocument?.verificationMethod?.[0].id).toBe(`${did}#local`)
    expect(tenantAgent.dids.resolve).toHaveBeenLastCalledWith(did)
  })

  test('refuses a DID its ledger shows deactivated (422), without a second read', async () => {
    vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
      didResolutionResultStub({ didDocument: { id: did }, didDocumentMetadata: { deactivated: true } }),
    )

    await expect(resolveActiveDidDocument(tenantAgent, did)).rejects.toThrow(`DID is deactivated: ${did}`)
    expect(tenantAgent.dids.resolve).toHaveBeenCalledTimes(1)
  })
})
