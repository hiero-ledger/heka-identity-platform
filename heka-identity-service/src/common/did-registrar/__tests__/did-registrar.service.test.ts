import { DidDocument } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, TenantAgent } from 'common/agent'
import AgentConfig from 'config/agent'
import { INSECURE_DEFAULTS } from 'config/insecure-defaults'

import { DidRegistrarService } from '../did-registrar.service'
import { DidHederaRegistrar, DidIndyBesuRegistrar, DidIndyRegistrar } from '../methods'

describe('DidRegistrarService: update and deactivate', () => {
  let service: DidRegistrarService
  const tenantAgent = createMock<TenantAgent>()
  const did = 'did:hedera:testnet:z6Mk_0.0.1'

  beforeEach(() => {
    service = new DidRegistrarService(
      createMock<Agent>(),
      createMock<ConfigType<typeof AgentConfig>>({ didMethods: ['indy', 'key', 'hedera'] }),
      createMock<EntityManager>(),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('a did:key DID cannot be updated or deactivated (422)', () => {
    expect(() => service.getUpdatingDidRegistrar('key', 'update')).toThrow(UnprocessableEntityException)
    expect(() => service.getUpdatingDidRegistrar('key', 'deactivate')).toThrow('did:key DIDs cannot be deactivated')
  })

  test.each(['jwk', 'peer', 'web'])('a did:%s DID has no registrar (400)', (method) => {
    expect(() => service.getUpdatingDidRegistrar(method, 'update')).toThrow(BadRequestException)
  })

  test('indy DIDs can be updated and deactivated, the key #verkey never changed', () => {
    expect(service.getUpdatingDidRegistrar('indy', 'update')).toBeInstanceOf(DidIndyRegistrar)
    expect(service.getUpdatingDidRegistrar('indy', 'deactivate')).toBeInstanceOf(DidIndyRegistrar)
    expect(service.getUpdatingDidRegistrar('indy', 'update').protectedKeyFragment).toBe('#verkey')
  })

  test('a method that is not configured is not supported (400), as on creation', () => {
    expect(() => service.getUpdatingDidRegistrar('indybesu', 'update')).toThrow(BadRequestException)
  })

  test('indybesu DIDs can be updated and deactivated once the method is configured', () => {
    const withIndyBesu = new DidRegistrarService(
      createMock<Agent>(),
      createMock<ConfigType<typeof AgentConfig>>({
        didMethods: ['key', 'indybesu'],
        indyBesuNetwork: 'testnet',
        indyBesuEndorserPrivateKey: INSECURE_DEFAULTS.INDY_BESU_ENDORSER_PRIVATE_KEY,
      }),
      createMock<EntityManager>(),
    )

    expect(withIndyBesu.getUpdatingDidRegistrar('indybesu', 'deactivate')).toBeInstanceOf(DidIndyBesuRegistrar)
  })

  test('hedera DIDs can be updated and deactivated', () => {
    expect(service.getUpdatingDidRegistrar('hedera', 'update')).toBeInstanceOf(DidHederaRegistrar)
    expect(service.getUpdatingDidRegistrar('hedera', 'deactivate')).toBeInstanceOf(DidHederaRegistrar)
  })

  test('returns the updated document, and turns a failed update into a 500 with the reason', async () => {
    const didDocument = new DidDocument({ id: did })
    const updateDid = vi
      .spyOn(DidHederaRegistrar.prototype, 'updateDid')
      .mockResolvedValueOnce({
        didState: { state: 'finished', did, didDocument },
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
      })
      .mockResolvedValueOnce({
        didState: { state: 'failed', reason: 'Unable to update DID: INSUFFICIENT_PAYER_BALANCE' },
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
      })
    const options = {
      did,
      currentDidDocument: didDocument,
      addServices: [],
      removeServices: ['#svc-1'],
      addVerificationMethods: [],
      removeVerificationMethods: [],
    }

    await expect(service.updateDid(tenantAgent, 'hedera', options)).resolves.toBe(didDocument)
    expect(updateDid).toHaveBeenCalledWith(tenantAgent, options)

    const failed = service.updateDid(tenantAgent, 'hedera', options)
    await expect(failed).rejects.toThrow(InternalServerErrorException)
    await expect(failed).rejects.toThrow(
      'DID document was not updated: Unable to update DID: INSUFFICIENT_PAYER_BALANCE',
    )
  })

  test('turns a failed deactivation into a 500 with the reason', async () => {
    vi.spyOn(DidHederaRegistrar.prototype, 'deactivateDid').mockResolvedValue({
      didState: { state: 'failed', reason: 'Did not found' },
      didDocumentMetadata: {},
      didRegistrationMetadata: {},
    })

    await expect(service.deactivateDid(tenantAgent, 'hedera', did)).rejects.toThrow(
      'DID document was not deactivated: Did not found',
    )
  })
})
