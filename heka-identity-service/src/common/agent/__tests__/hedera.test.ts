import { AgentContext, DidDocument } from '@credo-ts/core'
import { HederaLedgerService, HederaModuleConfig } from '@credo-ts/hedera'
import { createMock } from '@golevelup/ts-vitest'

import { HekaHederaLedgerService } from '../hedera'

describe('HekaHederaLedgerService', () => {
  const did = 'did:hedera:testnet:z6Mk_0.0.1'
  const createdDidDocument = { id: did, controller: 'did:hedera:testnet:controller' }
  let service: HekaHederaLedgerService
  let agentContext: AgentContext

  beforeEach(() => {
    service = new HekaHederaLedgerService(
      new HederaModuleConfig({ networks: [{ network: 'testnet', operatorId: '0.0.1', operatorKey: 'key' }] }),
    )
    agentContext = createMock<AgentContext>()
    vi.spyOn(service, 'resolveDid').mockResolvedValue({ didDocument: createdDidDocument } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('skips the update of a new DID whose document only carries the controller', async () => {
    const superUpdate = vi.spyOn(HederaLedgerService.prototype, 'updateDid')

    const result = await service.updateDid(agentContext, {
      did,
      didDocumentOperation: 'setDidDocument',
      didDocument: new DidDocument({ id: '', controller: ['did:hedera:testnet:controller'] }),
    })

    expect(result).toEqual({ did, didDocument: createdDidDocument })
    expect(service.resolveDid).toHaveBeenCalledWith(agentContext, did)
    expect(superUpdate).not.toHaveBeenCalled()
  })

  test.each([
    ['an empty document', new DidDocument({ id: '' })],
    ['a document with only a context', new DidDocument({ id: '', context: ['https://www.w3.org/ns/did/v1'] })],
  ])('skips the update of a new DID with %s', async (_, didDocument) => {
    const superUpdate = vi.spyOn(HederaLedgerService.prototype, 'updateDid')

    const result = await service.updateDid(agentContext, { did, didDocumentOperation: 'setDidDocument', didDocument })

    expect(result).toEqual({ did, didDocument: createdDidDocument })
    expect(superUpdate).not.toHaveBeenCalled()
  })

  test('fails when the new DID cannot be resolved', async () => {
    const superUpdate = vi.spyOn(HederaLedgerService.prototype, 'updateDid')
    vi.mocked(service.resolveDid).mockResolvedValue({ didDocument: null } as any)

    await expect(
      service.updateDid(agentContext, {
        did,
        didDocumentOperation: 'setDidDocument',
        didDocument: new DidDocument({ id: '', controller: ['did:hedera:testnet:controller'] }),
      }),
    ).rejects.toThrow(`DID ${did} not found`)
    expect(superUpdate).not.toHaveBeenCalled()
  })

  test('applies a controller-only document for other operations', async () => {
    const superUpdate = vi.spyOn(HederaLedgerService.prototype, 'updateDid').mockResolvedValue({} as any)
    const didDocument = new DidDocument({ id: '', controller: ['did:hedera:testnet:controller'] })

    await service.updateDid(agentContext, { did, didDocumentOperation: 'addToDidDocument', didDocument })

    expect(superUpdate).toHaveBeenCalledTimes(1)
    expect(service.resolveDid).not.toHaveBeenCalled()
  })

  test('applies any other update as Credo does', async () => {
    const superUpdate = vi.spyOn(HederaLedgerService.prototype, 'updateDid').mockResolvedValue({} as any)
    const didDocument = new DidDocument({
      id: did,
      service: [{ id: '#service-1', type: 'LinkedDomains', serviceEndpoint: 'https://example.com' }],
    })

    await service.updateDid(agentContext, { did, didDocumentOperation: 'setDidDocument', didDocument })
    await service.updateDid(agentContext, { did, didDocumentOperation: 'addToDidDocument', didDocument })

    expect(superUpdate).toHaveBeenCalledTimes(2)
    expect(service.resolveDid).not.toHaveBeenCalled()
  })
})
