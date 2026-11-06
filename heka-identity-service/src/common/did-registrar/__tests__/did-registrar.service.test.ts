import { DidDocument } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, TenantAgent } from 'common/agent'
import AgentConfig from 'config/agent'
import { INSECURE_DEFAULTS } from 'config/insecure-defaults'

import { DidRegistrarService } from '../did-registrar.service'
import { DidHederaRegistrar, DidIndyBesuRegistrar } from '../methods'

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

  test.each([
    ['key', 'did:key DIDs are immutable'],
    ['indy', 'did:indy update and deactivation are not implemented yet'],
    ['jwk', 'did:jwk DIDs are immutable'],
    ['peer', 'did:peer update and deactivation are not implemented yet'],
    ['web', 'did:web DIDs are not hosted by the Identity Service'],
  ])('a %s DID cannot be updated or deactivated (422 naming the reason)', (method, message) => {
    for (const operation of ['update', 'deactivate'] as const) {
      expect(() => service.getUpdatingDidRegistrar(method, operation)).toThrow(UnprocessableEntityException)
      expect(() => service.getUpdatingDidRegistrar(method, operation)).toThrow(message)
    }
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
        indyBesuEndorserPublicKey: '03af80b90d25145da28c583359beb47b21796b2fe1a23c1511e443e7a64dfdb27d',
      }),
      createMock<EntityManager>(),
    )

    expect(withIndyBesu.getUpdatingDidRegistrar('indybesu', 'deactivate')).toBeInstanceOf(DidIndyBesuRegistrar)
    expect(withIndyBesu.supportsUpdate('indybesu')).toBe(true)
    expect(withIndyBesu.supportsDeactivate('indybesu')).toBe(true)
  })

  test('hedera DIDs can be updated and deactivated', () => {
    expect(service.getUpdatingDidRegistrar('hedera', 'update')).toBeInstanceOf(DidHederaRegistrar)
    expect(service.supportsUpdate('hedera')).toBe(true)
    expect(service.supportsDeactivate('hedera')).toBe(true)
    expect(service.supportsUpdate('key')).toBe(false)
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
