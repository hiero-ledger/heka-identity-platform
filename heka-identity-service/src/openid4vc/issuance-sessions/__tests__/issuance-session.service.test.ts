import { generateKeyPairSync } from 'node:crypto'

import { getPublicJwkFromVerificationMethod, VerificationMethod } from '@credo-ts/core'
import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { createMock } from '@golevelup/ts-vitest'
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { TenantAgent } from 'common/agent'
import { AuthInfo, Role } from 'common/auth'
import AgentConfig from 'config/agent'
import { MdocIssuerCaService } from 'mdoc-issuer-ca'
import { SdJwtVcIssuerService } from 'sdjwt-vc-issuer'

import {
  didResolutionResultStub,
  issuanceSessionRecordStub,
  issuerRecordStub,
} from '../../../../test/helpers/mock-records'
import { StatusListService } from '../../../revocation/status-list/status-list.service'
import { TokenStatus, TokenStatusListService } from '../../../revocation/token-status-list/token-status-list.service'
import { OpenId4VcIssuanceSessionService } from '../issuance-session.service'

describe('OpenId4VcIssuanceSessionService', () => {
  let service: OpenId4VcIssuanceSessionService
  let tenantAgent: TenantAgent
  let statusListService: StatusListService
  let mdocIssuerCaService: MdocIssuerCaService
  let tokenStatusListService: TokenStatusListService
  let sdJwtVcIssuerService: SdJwtVcIssuerService
  let agencyConfig: ConfigType<typeof AgentConfig>
  let authInfo: AuthInfo

  const mockFindIssuanceSessionsByQuery = vi.fn()
  const mockDeleteById = vi.fn()

  beforeEach(() => {
    statusListService = createMock<StatusListService>()
    mdocIssuerCaService = createMock<MdocIssuerCaService>()
    // Default: tenant has a provisioned mdoc issuer (the offer() require-provisioning guard passes).
    vi.mocked(mdocIssuerCaService.requireProvisioned).mockResolvedValue({ id: 'iaca-1' } as never)
    tokenStatusListService = createMock<TokenStatusListService>()
    vi.mocked(tokenStatusListService.reserveIndexes).mockResolvedValue({
      id: 'tsl-1',
      uri: 'https://example.com/token-status-lists/tsl-1',
      indexes: [42],
    })
    sdJwtVcIssuerService = createMock<SdJwtVcIssuerService>()
    agencyConfig = {
      credentialsConfiguration: {
        OpenId4VC: {
          credentials: [
            OpenId4VciCredentialFormatProfile.SdJwtVc,
            OpenId4VciCredentialFormatProfile.JwtVcJson,
            OpenId4VciCredentialFormatProfile.JwtVcJsonLd,
            OpenId4VciCredentialFormatProfile.LdpVc,
            OpenId4VciCredentialFormatProfile.MsoMdoc,
          ],
        },
      },
    } as any

    service = new OpenId4VcIssuanceSessionService(
      agencyConfig,
      statusListService,
      mdocIssuerCaService,
      tokenStatusListService,
      sdJwtVcIssuerService,
    )

    mockFindIssuanceSessionsByQuery.mockReset()
    mockDeleteById.mockReset()

    tenantAgent = createMock<TenantAgent>({
      openid4vc: {
        issuer: {
          getIssuerByIssuerId: vi.fn(),
          getIssuanceSessionById: vi.fn(),
          createCredentialOffer: vi.fn(),
        },
      },
      dependencyManager: {
        resolve: vi.fn().mockImplementation((token: any) => {
          // Return different mocks depending on which class is being resolved
          if (token?.name === 'OpenId4VcIssuerService' || token?.prototype?.findIssuanceSessionsByQuery) {
            return { findIssuanceSessionsByQuery: mockFindIssuanceSessionsByQuery }
          }
          return { deleteById: mockDeleteById }
        }),
      },
      context: { contextCorrelationId: 'tenant-1' },
      dids: {
        resolve: vi.fn(),
        resolveCreatedDidDocumentWithKeys: vi.fn(),
      },
      kms: {
        getPublicKey: vi.fn(),
      },
    })

    authInfo = {
      userId: 'user-1',
      user: {} as any,
      userName: 'testuser',
      role: Role.Admin,
      orgId: 'org-1',
      walletId: 'wallet-1',
      tenantId: 'tenant-1',
    }
  })

  describe('getIssuanceSessionsByQuery', () => {
    test('should return issuance sessions matching query', async () => {
      const mockSessions = [
        issuanceSessionRecordStub({
          id: 'session-1',
          issuerId: 'issuer-1',
          state: 'OfferCreated',
          type: 'OpenId4VcIssuanceSessionRecord',
          createdAt: new Date(),
          credentialOfferPayload: {},
        }),
      ]

      mockFindIssuanceSessionsByQuery.mockResolvedValue(mockSessions)

      const result = await service.getIssuanceSessionsByQuery(tenantAgent, {
        publicIssuerId: 'issuer-1',
      })

      expect(mockFindIssuanceSessionsByQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ issuerId: 'issuer-1' }),
      )
      expect(result).toHaveLength(1)
      expect(result[0].publicIssuerId).toBe('issuer-1')
    })

    test('should return empty array when no sessions match', async () => {
      mockFindIssuanceSessionsByQuery.mockResolvedValue([])

      const result = await service.getIssuanceSessionsByQuery(tenantAgent, {
        publicIssuerId: 'non-existent',
      })

      expect(mockFindIssuanceSessionsByQuery).toHaveBeenCalled()
      expect(result).toHaveLength(0)
    })
  })

  describe('getIssuanceSession', () => {
    test('should return an issuance session by id', async () => {
      const mockSession = issuanceSessionRecordStub({
        id: 'session-1',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(mockSession)

      const result = await service.getIssuanceSession(tenantAgent, 'session-1')

      expect(tenantAgent.openid4vc.issuer.getIssuanceSessionById).toHaveBeenCalledWith('session-1')
      expect(result).toBeDefined()
      expect(result.id).toBe('session-1')
      expect(result.publicIssuerId).toBe('issuer-1')
    })
  })

  describe('deleteIssuanceSession', () => {
    test('should delete an issuance session by id', async () => {
      mockDeleteById.mockResolvedValue(undefined)

      await service.deleteIssuanceSession(tenantAgent, 'session-1')

      expect(mockDeleteById).toHaveBeenCalledWith(expect.anything(), 'session-1')
    })
  })

  describe('offer', () => {
    test('should throw UnprocessableEntityException when credential is not in issuer supported list', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {},
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.reserveIndexes).mockResolvedValue({ id: 'sl-1', indexes: [1] })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'non-existent-cred',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did: 'did:key:z6Mk1234' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await expect(service.offer(authInfo, tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).toHaveBeenCalledWith('issuer-1')
      expect(statusListService.reserveIndexes).not.toHaveBeenCalled()
    })

    test('should throw UnprocessableEntityException when credential format does not match supported format', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.reserveIndexes).mockResolvedValue({ id: 'sl-1', indexes: [1] })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-1',
            format: OpenId4VciCredentialFormatProfile.JwtVcJson,
            issuer: { did: 'did:key:z6Mk1234' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await expect(service.offer(authInfo, tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
    })

    test('should throw UnprocessableEntityException when DID cannot be resolved', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.reserveIndexes).mockResolvedValue({ id: 'sl-1', indexes: [1] })
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(didResolutionResultStub({ didDocument: null }))

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-1',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did: 'did:key:z6MkBad' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await expect(service.offer(authInfo, tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:key:z6MkBad')
    })

    test('should create issuance session for SdJwtVc format with a token-status-list credentialStatus', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-sd-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.reserveIndexes).mockResolvedValue({ id: 'sl-1', indexes: [1] })
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkGood#key-1' }],
          },
        }),
      )
      vi.mocked(tenantAgent.dids.resolveCreatedDidDocumentWithKeys).mockResolvedValue({
        didDocument: {} as never,
        keys: [{ didDocumentRelativeKeyId: '#key-1', kmsKeyId: 'kms-key-1' }],
      })

      const mockSession = issuanceSessionRecordStub({
        id: 'session-new',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      })

      vi.mocked(tenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
        credentialOffer: 'openid-credential-offer://...',
        issuanceSession: mockSession,
      })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-sd-1',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did: 'did:key:z6MkGood' },
            payload: { some: 'payload' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      const result = await service.offer(authInfo, tenantAgent, req)

      expect(tenantAgent.dids.resolve).toHaveBeenCalledWith('did:key:z6MkGood')
      // the list is signed with the DID's own verification-method key (same key as the credential)
      expect(tokenStatusListService.reserveIndexes).toHaveBeenCalledWith(
        tenantAgent.context,
        authInfo,
        {
          issuer: 'did:key:z6MkGood',
          keyId: 'kms-key-1',
          signer: { method: 'did', kid: 'did:key:z6MkGood#key-1' },
        },
        1,
      )
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          issuerId: 'issuer-1',
          issuanceMetadata: {
            credentials: [
              expect.objectContaining({
                credentialStatus: {
                  type: 'token-status-list',
                  location: 'https://example.com/token-status-lists/tsl-1',
                  index: 42,
                  indexes: [42],
                },
              }),
            ],
          },
        }),
      )
      expect(result.credentialOffer).toBe('openid-credential-offer://...')
      expect(result.issuanceSession.id).toBe('session-new')
      // SD-JWT VC never touches the W3C bitstring list
      expect(statusListService.reserveIndexes).not.toHaveBeenCalled()
      expect(statusListService.location).not.toHaveBeenCalled()
    })

    describe('DID records without a keys mapping (created before the Credo 0.6 key-id migration)', () => {
      const did = 'did:key:z6MkLegacy'
      const didUrl = `${did}#key-1`
      const publicKeyJwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' })
      const verificationMethod = new VerificationMethod({
        id: didUrl,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: publicKeyJwk as never,
      })
      // Credo itself signs such credentials with the verification method's legacy key id.
      const legacyKeyId = getPublicJwkFromVerificationMethod(verificationMethod).legacyKeyId
      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-sd-1',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did },
            payload: {},
          },
        ],
        baseUri: 'https://example.com',
      } as any

      beforeEach(() => {
        vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(
          issuerRecordStub({
            issuerId: 'issuer-1',
            credentialConfigurationsSupported: {
              'cred-sd-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
            },
          }),
        )
        vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
          didResolutionResultStub({ didDocument: { verificationMethod: [{ id: didUrl }] } }),
        )
        vi.mocked(tenantAgent.dids.resolveCreatedDidDocumentWithKeys).mockResolvedValue({
          didDocument: { dereferenceKey: vi.fn().mockReturnValue(verificationMethod) } as never,
          keys: undefined,
        })
        vi.mocked(tenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
          credentialOffer: 'openid-credential-offer://legacy',
          issuanceSession: issuanceSessionRecordStub({
            id: 'session-legacy',
            issuerId: 'issuer-1',
            state: 'OfferCreated',
            type: 'OpenId4VcIssuanceSessionRecord',
            createdAt: new Date(),
            credentialOfferPayload: {},
          }),
        })
      })

      test('signs the token status list with the legacy key id when the tenant KMS holds that key', async () => {
        vi.mocked(tenantAgent.kms.getPublicKey).mockResolvedValue({ ...publicKeyJwk, kid: legacyKeyId } as never)

        await service.offer(authInfo, tenantAgent, req)

        expect(tenantAgent.kms.getPublicKey).toHaveBeenCalledWith({ keyId: legacyKeyId })
        expect(tokenStatusListService.reserveIndexes).toHaveBeenCalledWith(
          tenantAgent.context,
          authInfo,
          {
            issuer: did,
            keyId: legacyKeyId,
            signer: { method: 'did', kid: didUrl },
          },
          1,
        )
      }, 1)

      test('still rejects with 422 when the KMS holds no key under the legacy id either', async () => {
        vi.mocked(tenantAgent.kms.getPublicKey).mockResolvedValue(null as never)

        await expect(service.offer(authInfo, tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
        expect(tokenStatusListService.reserveIndexes).not.toHaveBeenCalled()
      })
    })

    test('should sign the token status list of an x5c-mode SdJwtVc with the tenant issuer certificate key', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-sd-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      })
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.reserveIndexes).mockResolvedValue({ id: 'sl-1', indexes: [1] })
      vi.mocked(sdJwtVcIssuerService.loadIssuerCertificateChain).mockResolvedValue({
        issuerUrl: 'https://issuer.example',
        certificateChain: [
          { publicJwk: { hasKeyId: true, keyId: 'leaf-key' }, toString: () => 'LEAF' },
          { publicJwk: {}, toString: () => 'ROOT' },
        ] as never,
      })
      vi.mocked(tenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
        credentialOffer: 'openid-credential-offer://...',
        issuanceSession: issuanceSessionRecordStub({ id: 'session-x5c', issuerId: 'issuer-1' }),
      })

      await service.offer(authInfo, tenantAgent, {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-sd-1',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuerMode: 'x5c',
            issuer: {},
            payload: { some: 'payload' },
          },
        ],
        baseUri: 'https://example.com',
      } as any)

      expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
      expect(tokenStatusListService.reserveIndexes).toHaveBeenCalledWith(
        tenantAgent.context,
        authInfo,
        {
          issuer: 'https://issuer.example',
          keyId: 'leaf-key',
          signer: { method: 'x5c', x5c: ['LEAF', 'ROOT'] },
        },
        1,
      )
      // the identity the entry was allocated under is pinned to the session for the credential request
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          issuanceMetadata: {
            credentials: [
              expect.objectContaining({
                issuerMode: 'x5c',
                issuerSigner: { keyId: 'leaf-key', x5c: ['LEAF', 'ROOT'], issuer: 'https://issuer.example' },
              }),
            ],
          },
        }),
      )
    })

    test('reserves one status-list entry per credential of the issuer batch size (DID mode pins nothing)', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(
        issuerRecordStub({
          issuerId: 'issuer-1',
          batchCredentialIssuance: { batchSize: 3 },
          credentialConfigurationsSupported: {
            'cred-sd-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
          },
        }),
      )
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { verificationMethod: [{ id: 'did:key:z6MkGood#key-1' }] } }),
      )
      vi.mocked(tenantAgent.dids.resolveCreatedDidDocumentWithKeys).mockResolvedValue({
        didDocument: {} as never,
        keys: [{ didDocumentRelativeKeyId: '#key-1', kmsKeyId: 'kms-key-1' }],
      })
      vi.mocked(tokenStatusListService.reserveIndexes).mockResolvedValue({
        id: 'tsl-1',
        uri: 'https://example.com/token-status-lists/tsl-1',
        indexes: [7, 8, 9],
      })
      vi.mocked(tenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
        credentialOffer: 'openid-credential-offer://batch',
        issuanceSession: issuanceSessionRecordStub({ id: 'session-batch', issuerId: 'issuer-1' }),
      })

      await service.offer(authInfo, tenantAgent, {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-sd-1',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did: 'did:key:z6MkGood' },
            payload: {},
          },
        ],
        baseUri: 'https://example.com',
      } as any)

      expect(tokenStatusListService.reserveIndexes).toHaveBeenCalledWith(
        tenantAgent.context,
        authInfo,
        expect.objectContaining({ keyId: 'kms-key-1' }),
        3,
      )
      const [{ issuanceMetadata }] = vi.mocked(tenantAgent.openid4vc.issuer.createCredentialOffer).mock.calls[0]
      const [credential] = (issuanceMetadata as { credentials: Record<string, unknown>[] }).credentials
      expect(credential.credentialStatus).toEqual({
        type: 'token-status-list',
        location: 'https://example.com/token-status-lists/tsl-1',
        index: 7,
        indexes: [7, 8, 9],
      })
      expect(credential.issuerSigner).toBeUndefined()
    })

    test('should create issuance session for JwtVcJson format WITH credentialStatus and reserve a bitstring index', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-jwt-1': {
            format: 'jwt_vc_json',
            credential_definition: { type: ['VerifiableCredential', 'MyCred'] },
          },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.reserveIndexes).mockResolvedValue({ id: 'sl-1', indexes: [6] })
      vi.mocked(statusListService.location).mockReturnValue('https://example.com/status-lists/sl-1')
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkJwt#key-1' }],
          },
        }),
      )

      const mockSession = issuanceSessionRecordStub({
        id: 'session-jwt',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      })

      vi.mocked(tenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
        credentialOffer: 'openid-credential-offer://jwt',
        issuanceSession: mockSession,
      })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-jwt-1',
            format: OpenId4VciCredentialFormatProfile.JwtVcJson,
            issuer: { did: 'did:key:z6MkJwt' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      const result = await service.offer(authInfo, tenantAgent, req)

      expect(statusListService.location).toHaveBeenCalledWith('sl-1')
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({ issuerId: 'issuer-1' }),
      )
      expect(result.credentialOffer).toBe('openid-credential-offer://jwt')
      expect(statusListService.reserveIndexes).toHaveBeenCalledWith(authInfo, 'issuer-1', 1)
      // The index reserved in the status list must be the one the issued credential carries,
      // otherwise the credential points at a bit that is never set on revocation.
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          issuanceMetadata: expect.objectContaining({
            credentials: [expect.objectContaining({ credentialStatus: expect.objectContaining({ index: 6 }) })],
          }),
        }),
      )
    })

    test('should create issuance session for JwtVcJsonLd format WITH credentialStatus', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-ld-1': {
            format: 'jwt_vc_json-ld',
            credential_definition: { type: ['VerifiableCredential'] },
          },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.reserveIndexes).mockResolvedValue({ id: 'sl-2', indexes: [11] })
      vi.mocked(statusListService.location).mockReturnValue('https://example.com/status-lists/sl-2')
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkLd#key-1' }],
          },
        }),
      )

      const mockSession = issuanceSessionRecordStub({
        id: 'session-ld',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      })

      vi.mocked(tenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
        credentialOffer: 'openid-credential-offer://ld',
        issuanceSession: mockSession,
      })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-ld-1',
            format: OpenId4VciCredentialFormatProfile.JwtVcJsonLd,
            issuer: { did: 'did:key:z6MkLd' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await service.offer(authInfo, tenantAgent, req)

      expect(statusListService.reserveIndexes).toHaveBeenCalledWith(authInfo, 'issuer-1', 1)
      // The index reserved in the status list must be the one the issued credential carries,
      // otherwise the credential points at a bit that is never set on revocation.
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          issuanceMetadata: expect.objectContaining({
            credentials: [expect.objectContaining({ credentialStatus: expect.objectContaining({ index: 11 }) })],
          }),
        }),
      )
    })

    test('should create issuance session for LdpVc format WITH credentialStatus', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-ldp-1': {
            format: 'ldp_vc',
            credential_definition: { type: ['VerifiableCredential'] },
          },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.reserveIndexes).mockResolvedValue({ id: 'sl-3', indexes: [1] })
      vi.mocked(statusListService.location).mockReturnValue('https://example.com/status-lists/sl-3')
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkLdp#key-1' }],
          },
        }),
      )

      const mockSession = issuanceSessionRecordStub({
        id: 'session-ldp',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      })

      vi.mocked(tenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
        credentialOffer: 'openid-credential-offer://ldp',
        issuanceSession: mockSession,
      })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-ldp-1',
            format: OpenId4VciCredentialFormatProfile.LdpVc,
            issuer: { did: 'did:key:z6MkLdp' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await service.offer(authInfo, tenantAgent, req)

      expect(statusListService.reserveIndexes).toHaveBeenCalledWith(authInfo, 'issuer-1', 1)
      // The index reserved in the status list must be the one the issued credential carries,
      // otherwise the credential points at a bit that is never set on revocation.
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          issuanceMetadata: expect.objectContaining({
            credentials: [expect.objectContaining({ credentialStatus: expect.objectContaining({ index: 1 }) })],
          }),
        }),
      )
    })

    test('should reject an over-capacity batch before creating the credential offer', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-jwt-1': {
            format: 'jwt_vc_json',
            credential_definition: { type: ['VerifiableCredential'] },
          },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      // Capacity is enforced inside the locked reservation, which rejects before anything irreversible happens
      vi.mocked(statusListService.reserveIndexes).mockRejectedValue(
        new BadRequestException('Status list does not have enough free indexes'),
      )
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: { verificationMethod: [{ id: 'did:key:z6MkJwt#key-1' }] },
        }),
      )

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-jwt-1',
            format: OpenId4VciCredentialFormatProfile.JwtVcJson,
            issuer: { did: 'did:key:z6MkJwt' },
          },
          {
            credentialSupportedId: 'cred-jwt-1',
            format: OpenId4VciCredentialFormatProfile.JwtVcJson,
            issuer: { did: 'did:key:z6MkJwt' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await expect(service.offer(authInfo, tenantAgent, req)).rejects.toThrow(BadRequestException)

      expect(statusListService.reserveIndexes).toHaveBeenCalledWith(authInfo, 'issuer-1', 2)
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).not.toHaveBeenCalled()
    })

    test('should create issuance session for MsoMdoc format without DID resolution or credentialStatus', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-mdoc-1': {
            format: 'mso_mdoc',
            doctype: 'org.iso.18013.5.1.mDL',
          },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.reserveIndexes).mockResolvedValue({ id: 'sl-mdoc', indexes: [1] })

      const mockSession = issuanceSessionRecordStub({
        id: 'session-mdoc',
        issuerId: 'issuer-1',
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
      })

      vi.mocked(tenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
        credentialOffer: 'openid-credential-offer://mdoc',
        issuanceSession: mockSession,
      })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-mdoc-1',
            format: OpenId4VciCredentialFormatProfile.MsoMdoc,
            namespaces: { 'org.iso.18013.5.1': { family_name: 'Doe' } },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      const result = await service.offer(authInfo, tenantAgent, req)

      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({ issuerId: 'issuer-1' }),
      )
      expect(result.credentialOffer).toBe('openid-credential-offer://mdoc')
      // MsoMdoc does not support revocation, no bitstring reservation
      expect(statusListService.reserveIndexes).not.toHaveBeenCalled()
      // MsoMdoc uses X.509, so no DID resolution
      expect(tenantAgent.dids.resolve).not.toHaveBeenCalled()
    })

    test('should throw UnprocessableEntityException when credential format is not allowed by agency config', async () => {
      // Override config to allow no credential formats
      const restrictedConfig = {
        credentialsConfiguration: {
          OpenId4VC: {
            credentials: [],
          },
        },
      } as any

      const restrictedService = new OpenId4VcIssuanceSessionService(
        restrictedConfig,
        statusListService,
        mdocIssuerCaService,
        tokenStatusListService,
        sdJwtVcIssuerService,
      )

      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.reserveIndexes).mockResolvedValue({ id: 'sl-1', indexes: [1] })

      const req = {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-1',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did: 'did:key:z6Mk1234' },
          },
        ],
        baseUri: 'https://example.com',
      } as any

      await expect(restrictedService.offer(authInfo, tenantAgent, req)).rejects.toThrow(UnprocessableEntityException)
    })
  })

  describe('revokeIssuanceSession', () => {
    test('should throw error when credential not found', async () => {
      const mockSession = issuanceSessionRecordStub({
        id: 'session-1',
        issuanceMetadata: undefined,
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(mockSession)

      await expect(service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')).rejects.toThrow(
        'Credential not found',
      )
      expect(tenantAgent.openid4vc.issuer.getIssuanceSessionById).toHaveBeenCalledWith('session-1')
    })

    test('should throw error when credential does not support revocation', async () => {
      const mockSession = issuanceSessionRecordStub({
        id: 'session-1',
        issuanceMetadata: {
          credentials: [{ format: 'vc+sd-jwt', credentialStatus: undefined }],
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(mockSession)

      await expect(service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')).rejects.toThrow(
        'Credential does not support revocation',
      )
    })

    test('should revoke a token-status-list credential by invalidating its entry in the tenant context', async () => {
      const mockSession = issuanceSessionRecordStub({
        id: 'session-1',
        issuanceMetadata: {
          credentials: [
            {
              format: 'vc+sd-jwt',
              credentialStatus: {
                type: 'token-status-list',
                location: 'https://example.com/token-status-lists/tsl-1',
                index: 42,
              },
            },
          ],
        },
      })
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(mockSession)

      await service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')

      expect(tokenStatusListService.setStatuses).toHaveBeenCalledWith(
        tenantAgent.context,
        authInfo,
        'tsl-1',
        [42],
        TokenStatus.Invalid,
      )
      expect(statusListService.updateItems).not.toHaveBeenCalled()
    })

    test('revoking a batch issuance invalidates every reserved entry in one re-signing', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(
        issuanceSessionRecordStub({
          id: 'session-batch',
          issuanceMetadata: {
            credentials: [
              {
                format: 'vc+sd-jwt',
                credentialStatus: {
                  type: 'token-status-list',
                  location: 'https://example.com/token-status-lists/tsl-1',
                  index: 7,
                  indexes: [7, 8, 9],
                },
              },
            ],
          },
        }),
      )

      await service.revokeIssuanceSession(authInfo, tenantAgent, 'session-batch')

      expect(tokenStatusListService.setStatuses).toHaveBeenCalledWith(
        tenantAgent.context,
        authInfo,
        'tsl-1',
        [7, 8, 9],
        TokenStatus.Invalid,
      )
    })

    test('should call statusListService.updateItems on successful revocation', async () => {
      const mockSession = issuanceSessionRecordStub({
        id: 'session-1',
        issuanceMetadata: {
          credentials: [
            {
              format: 'jwt_vc_json',
              credentialStatus: {
                location: 'https://example.com/status-lists/sl-123',
                index: 5,
              },
            },
          ],
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(mockSession)
      vi.mocked(statusListService.updateItems).mockResolvedValue(undefined)

      await service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')

      expect(statusListService.updateItems).toHaveBeenCalledWith(authInfo, 'sl-123', {
        indexes: [5],
        revoked: true,
      })
    })
  })
})
