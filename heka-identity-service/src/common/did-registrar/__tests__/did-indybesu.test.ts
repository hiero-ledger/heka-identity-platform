import { DidDocument, DidDocumentService, TypedArrayEncoder, VerificationMethod } from '@credo-ts/core'
import { UnprocessableEntityException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { TenantAgent } from 'common/agent'
import AgentConfig from 'config/agent'

import { UpdateDidOptions } from '../did-registrar.types'
import { DidIndyBesuRegistrar } from '../methods/did-indybesu'

describe('did:indybesu registrar wrapper', () => {
  describe('updateDid', () => {
    const did = 'did:indybesu:testnet:0x2c7536E3605D9C16a7a3D7b1898e529396a65c23'
    const ownerKeyId = `${did}#KEY-1`
    const registrar = new DidIndyBesuRegistrar({ indyBesuNetwork: 'testnet' } as ConfigType<typeof AgentConfig>)
    let tenantAgent: TenantAgent
    let generatedKeys: number

    const currentDocument = () =>
      new DidDocument({
        context: ['https://www.w3.org/ns/did/v1'],
        id: did,
        verificationMethod: [
          new VerificationMethod({
            id: ownerKeyId,
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: did,
            publicKeyBase58: 'owner-public-key',
          }),
          new VerificationMethod({
            id: `${did}#key-1`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: 'z6Mk1',
          }),
        ],
        authentication: [ownerKeyId, `${did}#key-1`],
        assertionMethod: [ownerKeyId, `${did}#key-1`],
        capabilityInvocation: [`${did}#key-1`],
        service: [new DidDocumentService({ id: `${did}#svc-1`, type: 'LinkedDomains', serviceEndpoint: 'https://a' })],
      })

    const options = (overrides: Partial<UpdateDidOptions>): UpdateDidOptions => ({
      did,
      currentDidDocument: currentDocument(),
      addServices: [],
      removeServices: [],
      addVerificationMethods: [],
      removeVerificationMethods: [],
      ...overrides,
    })

    const submitted = () => {
      const [update] = vi.mocked(tenantAgent.dids.update).mock.calls[0]
      expect(update.didDocumentOperation).toBe('setDidDocument')
      return update as unknown as { didDocument: DidDocument; secret: { keys: unknown[] } }
    }

    beforeEach(() => {
      generatedKeys = 0
      tenantAgent = {
        config: { logger: { warn: vi.fn() } },
        kms: {
          createKey: vi.fn(() => {
            generatedKeys++
            return Promise.resolve({
              keyId: `kms-${generatedKeys}`,
              publicJwk: {
                kty: 'OKP',
                crv: 'Ed25519',
                x: TypedArrayEncoder.toBase64Url(new Uint8Array(32).fill(generatedKeys)),
              },
            })
          }),
          deleteKey: vi.fn().mockResolvedValue(true),
        },
        dids: {
          update: vi.fn().mockResolvedValue({
            didState: { state: 'finished', did, didDocument: currentDocument() },
            didDocumentMetadata: {},
            didRegistrationMetadata: {},
          }),
        },
      } as unknown as TenantAgent
    })

    test('protects the owner key', () => {
      expect(registrar.protectedKeyFragment).toBe('#KEY-1')
    })

    test('adds services and Ed25519 keys with full DID URLs, referenced by string, after the owner key', async () => {
      await registrar.updateDid(
        tenantAgent,
        options({
          addServices: [{ id: '#svc-2', type: 'OID4VCI', serviceEndpoint: 'https://issuer.example.com' }],
          addVerificationMethods: [{ id: '#key-2', purposes: ['assertionMethod', 'capabilityDelegation'] }],
        }),
      )

      const { didDocument, secret } = submitted()
      expect(didDocument.service?.map(({ id, type }) => [id, type])).toEqual([
        [`${did}#svc-1`, 'LinkedDomains'],
        [`${did}#svc-2`, 'OID4VCI'],
      ])
      expect(didDocument.verificationMethod?.map(({ id }) => id)).toEqual([ownerKeyId, `${did}#key-1`, `${did}#key-2`])
      expect(didDocument.verificationMethod?.[2]).toEqual(
        expect.objectContaining({
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: expect.stringMatching(/^z6Mk/),
        }),
      )
      expect(didDocument.verificationMethod?.[0].publicKeyBase58).toBe('owner-public-key')
      expect(didDocument.assertionMethod).toEqual([ownerKeyId, `${did}#key-1`, `${did}#key-2`])
      expect(didDocument.capabilityDelegation).toEqual([`${did}#key-2`])
      expect(didDocument.authentication).toEqual([ownerKeyId, `${did}#key-1`])
      expect(didDocument.context).toEqual([
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ])
      expect(secret).toEqual({ keys: [{ kmsKeyId: 'kms-1', didDocumentRelativeKeyId: '#key-2' }] })
    })

    test('removes a key with every reference to it, and services by fragment', async () => {
      await registrar.updateDid(
        tenantAgent,
        options({ removeServices: ['#svc-1'], removeVerificationMethods: ['#key-1'] }),
      )

      const { didDocument } = submitted()
      expect(didDocument.service ?? []).toEqual([])
      expect(didDocument.verificationMethod?.map(({ id }) => id)).toEqual([ownerKeyId])
      expect(didDocument.authentication).toEqual([ownerKeyId])
      expect(didDocument.assertionMethod).toEqual([ownerKeyId])
      expect(didDocument.capabilityInvocation ?? []).toEqual([])
      expect(tenantAgent.kms.createKey).not.toHaveBeenCalled()
    })

    test('rejects a service type the VDR does not accept (422), before any key is created', async () => {
      const update = registrar.updateDid(
        tenantAgent,
        options({
          addServices: [{ id: '#svc-2', type: 'Foo', serviceEndpoint: 'https://example.com' }],
          addVerificationMethods: [{ id: '#key-2', purposes: [] }],
        }),
      )

      await expect(update).rejects.toThrow(UnprocessableEntityException)
      await expect(update).rejects.toThrow(
        'did:indybesu supports service types: LinkedDomains, DIDCommMessaging, CredentialRegistry, OID4VCI, OID4VP',
      )
      expect(tenantAgent.kms.createKey).not.toHaveBeenCalled()
      expect(tenantAgent.dids.update).not.toHaveBeenCalled()
    })

    const failedUpdate = (didRegistrationMetadata: Record<string, unknown>) => ({
      didState: { state: 'failed' as const, reason: 'Ledger Client: Transaction reverted' },
      didDocumentMetadata: {},
      didRegistrationMetadata,
    })

    test('deletes the generated keys when the registrar sent nothing to the ledger', async () => {
      vi.mocked(tenantAgent.dids.update).mockResolvedValue(failedUpdate({ transactionSubmitted: false }))

      const result = await registrar.updateDid(
        tenantAgent,
        options({ addVerificationMethods: [{ id: '#key-2', purposes: [] }] }),
      )

      expect(result.didState.state).toBe('failed')
      expect(tenantAgent.kms.deleteKey).toHaveBeenCalledExactlyOnceWith({ keyId: 'kms-1' })
      expect(tenantAgent.config.logger.warn).not.toHaveBeenCalled()
    })

    test.each([
      ['the transaction was sent', { transactionSubmitted: true }],
      ['the registrar does not say whether it sent anything', {}],
    ])('keeps the generated keys when %s (it may still be mined)', async (_case, didRegistrationMetadata) => {
      vi.mocked(tenantAgent.dids.update).mockResolvedValue(failedUpdate(didRegistrationMetadata))

      const result = await registrar.updateDid(
        tenantAgent,
        options({ addVerificationMethods: [{ id: '#key-2', purposes: [] }] }),
      )

      expect(result.didState.state).toBe('failed')
      expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
      const [warning] = vi.mocked(tenantAgent.config.logger.warn).mock.calls[0]
      expect(warning).toContain('1 new key(s) are kept')
      expect(warning).not.toContain('kms-1')
    })

    test('keeps the generated keys when the registrar throws', async () => {
      vi.mocked(tenantAgent.dids.update).mockRejectedValue(new Error('storage down'))

      const result = await registrar.updateDid(
        tenantAgent,
        options({ addVerificationMethods: [{ id: '#key-2', purposes: [] }] }),
      )

      expect(result.didState).toEqual({ state: 'failed', reason: 'Unable to update DID: storage down' })
      expect(tenantAgent.kms.deleteKey).not.toHaveBeenCalled()
    })

    test('deletes the generated keys when the KMS fails before anything is sent', async () => {
      vi.mocked(tenantAgent.kms.createKey)
        .mockResolvedValueOnce({
          keyId: 'kms-1',
          publicJwk: { kty: 'OKP', crv: 'Ed25519', x: TypedArrayEncoder.toBase64Url(new Uint8Array(32).fill(1)) },
        } as never)
        .mockRejectedValueOnce(new Error('storage unavailable'))

      const result = await registrar.updateDid(
        tenantAgent,
        options({
          addVerificationMethods: [
            { id: '#key-2', purposes: [] },
            { id: '#key-3', purposes: [] },
          ],
        }),
      )

      expect(result.didState.state).toBe('failed')
      expect(tenantAgent.dids.update).not.toHaveBeenCalled()
      expect(tenantAgent.kms.deleteKey).toHaveBeenCalledExactlyOnceWith({ keyId: 'kms-1' })
    })
  })
})
