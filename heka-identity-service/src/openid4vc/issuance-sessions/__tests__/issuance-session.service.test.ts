import { RecordNotFoundError } from '@credo-ts/core'
import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { createMock } from '@golevelup/ts-vitest'
import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { TenantAgent } from 'common/agent'
import { AuthInfo, Role } from 'common/auth'
import { Logger } from 'common/logger'
import AgentConfig from 'config/agent'

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
  let tokenStatusListService: TokenStatusListService
  let logger: Logger
  let agencyConfig: ConfigType<typeof AgentConfig>
  let authInfo: AuthInfo

  const mockFindIssuanceSessionsByQuery = vi.fn()
  const mockDeleteById = vi.fn()

  beforeEach(() => {
    statusListService = createMock<StatusListService>()
    tokenStatusListService = createMock<TokenStatusListService>()
    logger = createMock<Logger>()
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

    service = new OpenId4VcIssuanceSessionService(agencyConfig, statusListService, tokenStatusListService, logger)

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
      context: { contextCorrelationId: 'tenant-tenant-1' },
      dids: {
        resolve: vi.fn(),
        resolveVerificationMethodFromCreatedDidRecord: vi.fn(),
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
    const session = (state: string, credentials?: unknown[]) =>
      issuanceSessionRecordStub({
        id: 'session-1',
        issuerId: 'issuer-1',
        state,
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
        ...(credentials ? { issuanceMetadata: { credentials } } : {}),
      })
    const sdJwt = (list: string, indexes: number[]) => ({
      format: OpenId4VciCredentialFormatProfile.SdJwtVc,
      credentialStatus: {
        type: 'token-status-list',
        location: `https://example.com/token-status-lists/${list}`,
        index: indexes[0],
        indexes,
      },
    })
    const issuedSdJwtSession = () => session('Completed', [sdJwt('tsl-1', [4, 8]), sdJwt('tsl-2', [15])])
    const conflict = new ConflictException(
      'Revoke the issued SD-JWT VC before deleting its issuance session: without the session it cannot be revoked',
    )

    beforeEach(() => mockDeleteById.mockResolvedValue(undefined))

    test('should delete an issuance session without status list entries in any state', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(
        session('Completed', [
          { format: OpenId4VciCredentialFormatProfile.JwtVcJson, credentialStatus: { location: 'x/sl-1', index: 1 } },
        ]),
      )

      await service.deleteIssuanceSession(tenantAgent, 'session-1')

      expect(tokenStatusListService.getStatuses).not.toHaveBeenCalled()
      expect(mockDeleteById).toHaveBeenCalledWith(tenantAgent.context, 'session-1')
    })

    test.each(['OfferCreated', 'OfferUriRetrieved'])(
      'should delete a pending SD-JWT offer (%s) without reading its status lists',
      async (state) => {
        vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(
          session(state, [sdJwt('tsl-1', [4])]),
        )

        await service.deleteIssuanceSession(tenantAgent, 'session-1')

        expect(tokenStatusListService.getStatuses).not.toHaveBeenCalled()
        expect(mockDeleteById).toHaveBeenCalledWith(tenantAgent.context, 'session-1')
      },
    )

    test.each(['AccessTokenCreated', 'CredentialRequestReceived', 'CredentialsPartiallyIssued', 'Completed', 'Error'])(
      'should refuse (409) to delete an SD-JWT session in state %s with an entry still valid',
      async (state) => {
        vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(
          session(state, [sdJwt('tsl-1', [4, 8]), sdJwt('tsl-2', [15])]),
        )
        // One entry of a batch is still valid
        vi.mocked(tokenStatusListService.getStatuses).mockResolvedValue(
          new Map([
            ['tsl-1', [1, 0]],
            ['tsl-2', [1]],
          ]),
        )

        await expect(service.deleteIssuanceSession(tenantAgent, 'session-1')).rejects.toThrow(conflict)

        expect(tokenStatusListService.getStatuses).toHaveBeenCalledWith(tenantAgent.context, [
          { id: 'tsl-1', indexes: [4, 8] },
          { id: 'tsl-2', indexes: [15] },
        ])
        expect(mockDeleteById).not.toHaveBeenCalled()
      },
    )

    test('should delete an issued SD-JWT session once every entry is revoked', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(issuedSdJwtSession())
      vi.mocked(tokenStatusListService.getStatuses).mockResolvedValue(
        new Map([
          ['tsl-1', [1, 1]],
          ['tsl-2', [1]],
        ]),
      )

      await service.deleteIssuanceSession(tenantAgent, 'session-1')

      expect(mockDeleteById).toHaveBeenCalledWith(tenantAgent.context, 'session-1')
    })

    test('should ignore entries whose status list is gone, as they cannot be revoked anyway', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(issuedSdJwtSession())
      vi.mocked(tokenStatusListService.getStatuses).mockResolvedValue(new Map([['tsl-1', [1, 1]]]))

      await service.deleteIssuanceSession(tenantAgent, 'session-1')

      expect(mockDeleteById).toHaveBeenCalledWith(tenantAgent.context, 'session-1')
    })

    test('should not delete when the status lists cannot be read', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(issuedSdJwtSession())
      vi.mocked(tokenStatusListService.getStatuses).mockRejectedValue(new Error('connection refused'))

      await expect(service.deleteIssuanceSession(tenantAgent, 'session-1')).rejects.toThrow('connection refused')

      expect(mockDeleteById).not.toHaveBeenCalled()
    })

    test('should throw NotFoundException when the issuance session does not exist', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockRejectedValue(
        new RecordNotFoundError('not found', { recordType: 'OpenId4VcIssuanceSessionRecord' }),
      )

      await expect(service.deleteIssuanceSession(tenantAgent, 'session-1')).rejects.toThrow(
        new NotFoundException('Issuance session not found'),
      )
      expect(mockDeleteById).not.toHaveBeenCalled()
    })
  })

  describe('offer', () => {
    test('should throw UnprocessableEntityException when credential is not in issuer supported list', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {},
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.getOrCreate).mockResolvedValue({ id: 'sl-1', lastIndex: 0 } as any)

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
      // An SD-JWT-only offer does not touch the W3C bitstring list
      expect(statusListService.getOrCreate).not.toHaveBeenCalled()
    })

    test('should throw UnprocessableEntityException when credential format does not match supported format', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.getOrCreate).mockResolvedValue({ id: 'sl-1', lastIndex: 0 } as any)

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
      vi.mocked(statusListService.getOrCreate).mockResolvedValue({ id: 'sl-1', lastIndex: 0 } as any)
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

    test('should reserve a token status list entry for an SdJwtVc offer, signed by the issuer key', async () => {
      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-sd-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkGood#key-1' }],
          },
        }),
      )
      vi.mocked(tenantAgent.dids.resolveVerificationMethodFromCreatedDidRecord).mockResolvedValue({
        publicJwk: { keyId: 'kms-key-1' },
      } as any)
      vi.mocked(tokenStatusListService.reserveIndexes).mockResolvedValue({
        id: 'tsl-1',
        uri: 'https://example.com/token-status-lists/tsl-1',
        indexes: [42],
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
      // The signing key is resolved from the same DID URL the credential is signed with
      expect(tenantAgent.dids.resolveVerificationMethodFromCreatedDidRecord).toHaveBeenCalledWith(
        'did:key:z6MkGood#key-1',
      )
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
                issuer: { did: 'did:key:z6MkGood', didUrl: 'did:key:z6MkGood#key-1' },
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
      // The entry was just reserved: revocable and not revoked, without reading the list back
      expect(result.issuanceSession.revocable).toBe(true)
      expect(result.issuanceSession.revoked).toBe(false)
      expect(tokenStatusListService.getStatuses).not.toHaveBeenCalled()
      // SD-JWT VCs never use the W3C bitstring list
      expect(statusListService.getOrCreate).not.toHaveBeenCalled()
      expect(statusListService.addItems).not.toHaveBeenCalled()
      expect(statusListService.location).not.toHaveBeenCalled()
    })

    test('should reserve one token status list entry per credential of a batch', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(
        issuerRecordStub({
          issuerId: 'issuer-1',
          batchCredentialIssuance: { batchSize: 3 },
          credentialConfigurationsSupported: { 'cred-sd-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' } },
        }),
      )
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { verificationMethod: [{ id: 'did:key:z6MkGood#key-1' }] } }),
      )
      vi.mocked(tenantAgent.dids.resolveVerificationMethodFromCreatedDidRecord).mockResolvedValue({
        publicJwk: { keyId: 'kms-key-1' },
      } as any)
      vi.mocked(tokenStatusListService.reserveIndexes).mockResolvedValue({
        id: 'tsl-1',
        uri: 'https://example.com/token-status-lists/tsl-1',
        indexes: [4, 8, 15],
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
      } as any)

      expect(tokenStatusListService.reserveIndexes).toHaveBeenCalledWith(
        tenantAgent.context,
        authInfo,
        expect.anything(),
        3,
      )
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          issuanceMetadata: {
            credentials: [
              expect.objectContaining({
                credentialStatus: expect.objectContaining({ index: 4, indexes: [4, 8, 15] }),
              }),
            ],
          },
        }),
      )
    })

    test('should reject an SdJwtVc offer whose issuer DID was not created in this wallet (422)', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(
        issuerRecordStub({
          issuerId: 'issuer-1',
          credentialConfigurationsSupported: { 'cred-sd-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' } },
        }),
      )
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { verificationMethod: [{ id: 'did:key:z6MkOther#key-1' }] } }),
      )
      vi.mocked(tenantAgent.dids.resolveVerificationMethodFromCreatedDidRecord).mockRejectedValue(
        new RecordNotFoundError("Created did 'did:key:z6MkOther' not found", { recordType: 'DidRecord' }),
      )

      const offer = service.offer(authInfo, tenantAgent, {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-sd-1',
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            issuer: { did: 'did:key:z6MkOther' },
            payload: {},
          },
        ],
      } as any)

      await expect(offer).rejects.toThrow(
        new UnprocessableEntityException('Issuer DID is not controlled by this wallet'),
      )
      expect(tokenStatusListService.reserveIndexes).not.toHaveBeenCalled()
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).not.toHaveBeenCalled()
    })

    test.each([
      [
        { payload: { status: { status_list: { idx: 0, uri: 'https://evil.example' } } } },
        '`status` is set by the issuer',
      ],
      [
        { payload: {}, disclosureFrame: { _sd: ['status'] } },
        '`status` is set by the issuer and cannot be selectively disclosed',
      ],
    ])('should reject an SdJwtVc offer that sets the status claim itself (%j)', async (credential, message) => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(
        issuerRecordStub({
          issuerId: 'issuer-1',
          credentialConfigurationsSupported: { 'cred-sd-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' } },
        }),
      )

      await expect(
        service.offer(authInfo, tenantAgent, {
          publicIssuerId: 'issuer-1',
          credentials: [
            {
              credentialSupportedId: 'cred-sd-1',
              format: OpenId4VciCredentialFormatProfile.SdJwtVc,
              issuer: { did: 'did:key:z6MkGood' },
              ...credential,
            },
          ],
        } as any),
      ).rejects.toThrow(new BadRequestException(message))
      expect(tokenStatusListService.reserveIndexes).not.toHaveBeenCalled()
    })

    test('should rethrow unexpected errors from resolving the SdJwtVc signing key', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(
        issuerRecordStub({
          issuerId: 'issuer-1',
          credentialConfigurationsSupported: { 'cred-sd-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' } },
        }),
      )
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { verificationMethod: [{ id: 'did:key:z6MkGood#key-1' }] } }),
      )
      const error = new Error('storage failure')
      vi.mocked(tenantAgent.dids.resolveVerificationMethodFromCreatedDidRecord).mockRejectedValue(error)

      await expect(
        service.offer(authInfo, tenantAgent, {
          publicIssuerId: 'issuer-1',
          credentials: [
            {
              credentialSupportedId: 'cred-sd-1',
              format: OpenId4VciCredentialFormatProfile.SdJwtVc,
              issuer: { did: 'did:key:z6MkGood' },
              payload: {},
            },
          ],
        } as any),
      ).rejects.toBe(error)
    })

    test('should create issuance session for JwtVcJson format WITH credentialStatus and call addItems', async () => {
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
      vi.mocked(statusListService.getOrCreate).mockResolvedValue({ id: 'sl-1', lastIndex: 5 } as any)
      vi.mocked(statusListService.location).mockReturnValue('https://example.com/status-lists/sl-1')
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkJwt#key-1' }],
          },
        }),
      )
      vi.mocked(statusListService.addItems).mockResolvedValue(undefined)

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
      expect(statusListService.addItems).toHaveBeenCalledWith(authInfo, 'sl-1', [5])
      // The index reserved in the status list must be the one the issued credential carries,
      // otherwise the credential points at a bit that is never set on revocation.
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          issuanceMetadata: expect.objectContaining({
            credentials: [expect.objectContaining({ credentialStatus: expect.objectContaining({ index: 5 }) })],
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
      vi.mocked(statusListService.getOrCreate).mockResolvedValue({ id: 'sl-2', lastIndex: 10 } as any)
      vi.mocked(statusListService.location).mockReturnValue('https://example.com/status-lists/sl-2')
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkLd#key-1' }],
          },
        }),
      )
      vi.mocked(statusListService.addItems).mockResolvedValue(undefined)

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

      expect(statusListService.addItems).toHaveBeenCalledWith(authInfo, 'sl-2', [10])
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          issuanceMetadata: expect.objectContaining({
            credentials: [expect.objectContaining({ credentialStatus: expect.objectContaining({ index: 10 }) })],
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
      vi.mocked(statusListService.getOrCreate).mockResolvedValue({ id: 'sl-3', lastIndex: 0 } as any)
      vi.mocked(statusListService.location).mockReturnValue('https://example.com/status-lists/sl-3')
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: {
            verificationMethod: [{ id: 'did:key:z6MkLdp#key-1' }],
          },
        }),
      )
      vi.mocked(statusListService.addItems).mockResolvedValue(undefined)

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

      expect(statusListService.addItems).toHaveBeenCalledWith(authInfo, 'sl-3', [0])
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          issuanceMetadata: expect.objectContaining({
            credentials: [expect.objectContaining({ credentialStatus: expect.objectContaining({ index: 0 }) })],
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
      // One free slot (lastIndex 99 of size 100) but two revocable credentials requested
      vi.mocked(statusListService.getOrCreate).mockResolvedValue({ id: 'sl-4', lastIndex: 99, size: 100 } as any)
      vi.mocked(statusListService.location).mockReturnValue('https://example.com/status-lists/sl-4')
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({
          didDocument: { verificationMethod: [{ id: 'did:key:z6MkJwt#key-1' }] },
        }),
      )
      vi.mocked(statusListService.assertHasFreeIndexes).mockImplementation(() => {
        throw new BadRequestException('Status list does not have enough free indexes')
      })

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

      // The point of the preflight: nothing irreversible may happen once capacity is known to be short
      expect(tenantAgent.openid4vc.issuer.createCredentialOffer).not.toHaveBeenCalled()
      expect(statusListService.addItems).not.toHaveBeenCalled()
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
      vi.mocked(statusListService.getOrCreate).mockResolvedValue({ id: 'sl-mdoc', lastIndex: 0 } as any)

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
      // MsoMdoc does not support revocation, no status list of any kind
      expect(statusListService.getOrCreate).not.toHaveBeenCalled()
      expect(statusListService.addItems).not.toHaveBeenCalled()
      expect(tokenStatusListService.reserveIndexes).not.toHaveBeenCalled()
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
        tokenStatusListService,
        logger,
      )

      const mockIssuer = issuerRecordStub({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'https://example.com/vct' },
        },
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(mockIssuer)
      vi.mocked(statusListService.getOrCreate).mockResolvedValue({ id: 'sl-1', lastIndex: 0 } as any)

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

  describe('revocable', () => {
    const formats = [
      OpenId4VciCredentialFormatProfile.JwtVcJson,
      OpenId4VciCredentialFormatProfile.JwtVcJsonLd,
      OpenId4VciCredentialFormatProfile.LdpVc,
      OpenId4VciCredentialFormatProfile.SdJwtVc,
      OpenId4VciCredentialFormatProfile.MsoMdoc,
    ]

    // Sessions without a token status list entry report false: W3C VCs get a bitstring list entry that the
    // issued credentials do not embed, and SD-JWT VCs issued before token status lists have none.
    const sessionWithFormat = (format: OpenId4VciCredentialFormatProfile) =>
      issuanceSessionRecordStub({
        id: `session-${format}`,
        issuerId: 'issuer-1',
        state: 'Completed',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
        issuanceMetadata: {
          credentials: [
            {
              format,
              credentialStatus: { location: 'https://example.com/status-lists/sl-1', index: 1 },
            },
          ],
        },
      })

    test.each(formats)('is false for listed sessions of format %s', async (format) => {
      mockFindIssuanceSessionsByQuery.mockResolvedValue([sessionWithFormat(format)])

      const [session] = await service.getIssuanceSessionsByQuery(tenantAgent, { state: 'Completed' as any })

      expect(session.revocable).toBe(false)
      expect(session).not.toHaveProperty('revoked')
    })

    test.each(formats)('is false for a session of format %s fetched by id', async (format) => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(sessionWithFormat(format))

      const session = await service.getIssuanceSession(tenantAgent, `session-${format}`)

      expect(session.revocable).toBe(false)
      expect(session).not.toHaveProperty('revoked')
    })

    test('is false in the offer response of a format that gets a status list entry', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue(
        issuerRecordStub({
          issuerId: 'issuer-1',
          credentialConfigurationsSupported: {
            'cred-jwt-1': { format: 'jwt_vc_json', credential_definition: { type: ['VerifiableCredential'] } },
          },
        }),
      )
      vi.mocked(statusListService.getOrCreate).mockResolvedValue({ id: 'sl-1', lastIndex: 0 } as any)
      vi.mocked(statusListService.location).mockReturnValue('https://example.com/status-lists/sl-1')
      vi.mocked(tenantAgent.dids.resolve).mockResolvedValue(
        didResolutionResultStub({ didDocument: { verificationMethod: [{ id: 'did:key:z6MkJwt#key-1' }] } }),
      )
      vi.mocked(tenantAgent.openid4vc.issuer.createCredentialOffer).mockResolvedValue({
        credentialOffer: 'openid-credential-offer://jwt',
        issuanceSession: sessionWithFormat(OpenId4VciCredentialFormatProfile.JwtVcJson),
      })

      const result = await service.offer(authInfo, tenantAgent, {
        publicIssuerId: 'issuer-1',
        credentials: [
          {
            credentialSupportedId: 'cred-jwt-1',
            format: OpenId4VciCredentialFormatProfile.JwtVcJson,
            issuer: { did: 'did:key:z6MkJwt' },
          },
        ],
      } as any)

      expect(result.issuanceSession.revocable).toBe(false)
      expect(result.issuanceSession).not.toHaveProperty('revoked')
    })

    const sdJwtSession = (id: string, entries: Array<{ list: string; indexes: number[] }>) =>
      issuanceSessionRecordStub({
        id,
        issuerId: 'issuer-1',
        state: 'Completed',
        type: 'OpenId4VcIssuanceSessionRecord',
        createdAt: new Date(),
        credentialOfferPayload: {},
        issuanceMetadata: {
          credentials: entries.map(({ list, indexes }) => ({
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            credentialStatus: {
              type: 'token-status-list',
              location: `https://example.com/token-status-lists/${list}`,
              index: indexes[0],
              indexes,
            },
          })),
        },
      })

    test('reads every listed SD-JWT session from the token status lists in one call', async () => {
      mockFindIssuanceSessionsByQuery.mockResolvedValue([
        sdJwtSession('active', [{ list: 'tsl-1', indexes: [1, 2] }]),
        sdJwtSession('revoked', [{ list: 'tsl-1', indexes: [3] }]),
        sdJwtSession('partly', [
          { list: 'tsl-1', indexes: [4] },
          { list: 'tsl-2', indexes: [5] },
        ]),
        sessionWithFormat(OpenId4VciCredentialFormatProfile.JwtVcJson),
      ])
      vi.mocked(tokenStatusListService.getStatuses).mockResolvedValue(
        new Map([
          ['tsl-1', [0, 0, 1, 1]],
          ['tsl-2', [0]],
        ]),
      )

      const sessions = await service.getIssuanceSessionsByQuery(tenantAgent, { state: 'Completed' as any })

      expect(tokenStatusListService.getStatuses).toHaveBeenCalledTimes(1)
      expect(tokenStatusListService.getStatuses).toHaveBeenCalledWith(tenantAgent.context, [
        { id: 'tsl-1', indexes: [1, 2] },
        { id: 'tsl-1', indexes: [3] },
        { id: 'tsl-1', indexes: [4] },
        { id: 'tsl-2', indexes: [5] },
      ])
      expect(sessions.map(({ id, revocable, revoked }) => ({ id, revocable, revoked }))).toEqual([
        { id: 'active', revocable: true, revoked: false },
        { id: 'revoked', revocable: true, revoked: true },
        { id: 'partly', revocable: true, revoked: false },
        { id: `session-${OpenId4VciCredentialFormatProfile.JwtVcJson}`, revocable: false, revoked: undefined },
      ])
    })

    test('an SD-JWT session fetched by id reports revoked once every entry is invalid', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(
        sdJwtSession('session-sd', [{ list: 'tsl-1', indexes: [7, 9] }]),
      )
      vi.mocked(tokenStatusListService.getStatuses).mockResolvedValue(new Map([['tsl-1', [1, 1]]]))

      const session = await service.getIssuanceSession(tenantAgent, 'session-sd')

      expect(session.revocable).toBe(true)
      expect(session.revoked).toBe(true)
    })

    test('an SD-JWT session whose list is gone is not revocable', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(
        sdJwtSession('session-sd', [{ list: 'gone', indexes: [7] }]),
      )
      vi.mocked(tokenStatusListService.getStatuses).mockResolvedValue(new Map())

      const session = await service.getIssuanceSession(tenantAgent, 'session-sd')

      expect(session.revocable).toBe(false)
      expect(session).not.toHaveProperty('revoked')
    })

    test('a failed status read keeps the list working: revocable, revoked unknown, one warning with list ids', async () => {
      mockFindIssuanceSessionsByQuery.mockResolvedValue([
        sdJwtSession('session-a', [{ list: 'tsl-1', indexes: [1] }]),
        sdJwtSession('session-b', [{ list: 'tsl-1', indexes: [2] }]),
        sessionWithFormat(OpenId4VciCredentialFormatProfile.MsoMdoc),
      ])
      vi.mocked(tokenStatusListService.getStatuses).mockRejectedValue(new Error('connection refused'))

      const sessions = await service.getIssuanceSessionsByQuery(tenantAgent, {})

      expect(sessions.map(({ revocable }) => revocable)).toEqual([true, true, false])
      for (const session of sessions) expect(session).not.toHaveProperty('revoked')
      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith({ statusListIds: ['tsl-1'] }, 'Could not read token status lists')
    })
  })

  describe('revokeIssuanceSession', () => {
    test('should throw NotFoundException when the issuance session does not exist', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockRejectedValue(
        new RecordNotFoundError('not found', { recordType: 'OpenId4VcIssuanceSessionRecord' }),
      )

      await expect(service.revokeIssuanceSession(authInfo, tenantAgent, 'missing')).rejects.toThrow(
        new NotFoundException('Issuance session not found'),
      )
      expect(statusListService.updateItems).not.toHaveBeenCalled()
    })

    test('should rethrow other errors from loading the session', async () => {
      const error = new Error('storage failure')
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockRejectedValue(error)

      await expect(service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')).rejects.toBe(error)
    })

    test('should throw BadRequestException when the session has no credentials metadata', async () => {
      const mockSession = issuanceSessionRecordStub({
        id: 'session-1',
        issuanceMetadata: undefined,
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(mockSession)

      await expect(service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')).rejects.toThrow(
        new BadRequestException('Credential format does not support revocation'),
      )
      expect(tenantAgent.openid4vc.issuer.getIssuanceSessionById).toHaveBeenCalledWith('session-1')
      expect(statusListService.updateItems).not.toHaveBeenCalled()
    })

    test.each([OpenId4VciCredentialFormatProfile.SdJwtVc, OpenId4VciCredentialFormatProfile.MsoMdoc])(
      'should throw BadRequestException for %s, which has no credentialStatus',
      async (format) => {
        const mockSession = issuanceSessionRecordStub({
          id: 'session-1',
          issuanceMetadata: {
            credentials: [{ format, credentialStatus: undefined }],
          },
        })

        vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(mockSession)

        await expect(service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')).rejects.toThrow(
          new BadRequestException('Credential format does not support revocation'),
        )
        expect(statusListService.updateItems).not.toHaveBeenCalled()
      },
    )

    test('should invalidate every token status list entry of an SD-JWT VC session', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(
        issuanceSessionRecordStub({
          id: 'session-sd',
          issuanceMetadata: {
            credentials: [
              {
                format: OpenId4VciCredentialFormatProfile.SdJwtVc,
                credentialStatus: {
                  type: 'token-status-list',
                  location: 'https://example.com/token-status-lists/tsl-1',
                  index: 4,
                  indexes: [4, 8],
                },
              },
              {
                format: OpenId4VciCredentialFormatProfile.SdJwtVc,
                credentialStatus: {
                  type: 'token-status-list',
                  location: 'https://example.com/token-status-lists/tsl-2',
                  index: 15,
                },
              },
            ],
          },
        }),
      )
      vi.mocked(tokenStatusListService.setEntryStatuses).mockResolvedValue(true)

      await service.revokeIssuanceSession(authInfo, tenantAgent, 'session-sd')

      // All lists of the session in one call: one transaction, check and update under the same row locks
      expect(tokenStatusListService.setEntryStatuses).toHaveBeenCalledTimes(1)
      expect(tokenStatusListService.setEntryStatuses).toHaveBeenCalledWith(
        tenantAgent.context,
        [
          { id: 'tsl-1', indexes: [4, 8] },
          { id: 'tsl-2', indexes: [15] },
        ],
        TokenStatus.Invalid,
      )
      expect(tokenStatusListService.getStatuses).not.toHaveBeenCalled()
      expect(statusListService.updateItems).not.toHaveBeenCalled()
    })

    const sdJwtRevokeSession = () =>
      issuanceSessionRecordStub({
        id: 'session-sd',
        issuanceMetadata: {
          credentials: [
            {
              format: OpenId4VciCredentialFormatProfile.SdJwtVc,
              credentialStatus: {
                type: 'token-status-list',
                location: 'https://example.com/token-status-lists/tsl-1',
                index: 4,
                indexes: [4, 8],
              },
            },
          ],
        },
      })

    test('should throw ConflictException when every entry of the session is already invalid', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(sdJwtRevokeSession())
      // The token status list service changed nothing: every entry was already invalid
      vi.mocked(tokenStatusListService.setEntryStatuses).mockResolvedValue(false)

      await expect(service.revokeIssuanceSession(authInfo, tenantAgent, 'session-sd')).rejects.toThrow(
        new ConflictException('Credential is already revoked'),
      )
    })

    test('should throw NotFoundException when the token status list is missing', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(sdJwtRevokeSession())
      vi.mocked(tokenStatusListService.setEntryStatuses).mockRejectedValue(
        new NotFoundException('Status list not found'),
      )

      await expect(service.revokeIssuanceSession(authInfo, tenantAgent, 'session-sd')).rejects.toThrow(
        new NotFoundException('Status list not found'),
      )
    })

    test('should never answer 409 for W3C VCs, whose bit is set again', async () => {
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuanceSessionById).mockResolvedValue(
        issuanceSessionRecordStub({
          id: 'session-1',
          issuanceMetadata: {
            credentials: [
              {
                format: 'jwt_vc_json',
                credentialStatus: { location: 'https://example.com/status-lists/sl-1', index: 5 },
              },
            ],
          },
        }),
      )

      await service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')
      await service.revokeIssuanceSession(authInfo, tenantAgent, 'session-1')

      expect(statusListService.updateItems).toHaveBeenCalledTimes(2)
      expect(tokenStatusListService.getStatuses).not.toHaveBeenCalled()
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
