import { createMock } from '@golevelup/ts-vitest'
import { ConflictException, UnprocessableEntityException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { DidService } from 'did/did.service'

import { OpenId4VcVerifierService } from '../verifier.service'

describe('OpenId4VcVerifierService', () => {
  let service: OpenId4VcVerifierService
  let didService: DidService
  let tenantAgent: TenantAgent

  const mockFindByQuery = vi.fn()
  const mockCreateVerifier = vi.fn()

  beforeEach(() => {
    didService = createMock<DidService>({ assertOwnActiveDid: vi.fn().mockResolvedValue(undefined) })
    service = new OpenId4VcVerifierService(didService)
    mockFindByQuery.mockReset()
    mockCreateVerifier.mockReset()

    tenantAgent = createMock<TenantAgent>({
      openid4vc: {
        verifier: {
          createVerifier: mockCreateVerifier,
        },
      },
      dependencyManager: {
        resolve: vi.fn().mockReturnValue({
          findByQuery: mockFindByQuery,
        }),
      },
      context: {},
    })
  })

  describe('createVerifier', () => {
    test('should create a verifier when no duplicate exists', async () => {
      const options = { publicVerifierId: 'did:key:z6MkVerifier1' } as any

      mockFindByQuery.mockResolvedValue([])

      const mockVerifierRecord = {
        id: 'record-1',
        verifierId: 'did:key:z6MkVerifier1',
        type: 'OpenId4VcVerifierRecord',
        createdAt: new Date(),
      }

      mockCreateVerifier.mockResolvedValue(mockVerifierRecord)

      const result = await service.createVerifier(tenantAgent, options)

      expect(didService.assertOwnActiveDid).toHaveBeenCalledWith(tenantAgent, 'did:key:z6MkVerifier1')
      expect(mockFindByQuery).toHaveBeenCalledWith(expect.anything(), { verifierId: 'did:key:z6MkVerifier1' })
      expect(mockCreateVerifier).toHaveBeenCalledWith({ verifierId: 'did:key:z6MkVerifier1' })
      expect(result.publicVerifierId).toBe('did:key:z6MkVerifier1')
    })

    test('creates no verifier for a DID the wallet did not create or deactivated', async () => {
      vi.mocked(didService.assertOwnActiveDid).mockRejectedValue(
        new UnprocessableEntityException('did:key:z6MkOther is not a DID this wallet created'),
      )

      await expect(service.createVerifier(tenantAgent, { publicVerifierId: 'did:key:z6MkOther' })).rejects.toThrow(
        UnprocessableEntityException,
      )
      expect(mockCreateVerifier).not.toHaveBeenCalled()
    })

    test('checks no wallet DID for a verifier id that is not a DID', async () => {
      mockFindByQuery.mockResolvedValue([])
      mockCreateVerifier.mockResolvedValue({ verifierId: 'example-verifier', createdAt: new Date() })

      await service.createVerifier(tenantAgent, { publicVerifierId: 'example-verifier' })

      expect(didService.assertOwnActiveDid).not.toHaveBeenCalled()
      expect(mockCreateVerifier).toHaveBeenCalledWith({ verifierId: 'example-verifier' })
    })

    test('should throw ConflictException if verifier already exists', async () => {
      const options = { publicVerifierId: 'did:key:z6MkVerifier1' } as any

      mockFindByQuery.mockResolvedValue([{ verifierId: 'did:key:z6MkVerifier1' }])

      await expect(service.createVerifier(tenantAgent, options)).rejects.toThrow(ConflictException)
      expect(mockFindByQuery).toHaveBeenCalledWith(expect.anything(), { verifierId: 'did:key:z6MkVerifier1' })
    })
  })

  describe('find', () => {
    test('should return matching verifiers', async () => {
      const mockVerifiers = [
        {
          id: 'record-1',
          verifierId: 'did:key:z6MkVerifier1',
          type: 'OpenId4VcVerifierRecord',
          createdAt: new Date(),
        },
      ]

      mockFindByQuery.mockResolvedValue(mockVerifiers)

      const result = await service.find(tenantAgent, 'did:key:z6MkVerifier1')

      expect(mockFindByQuery).toHaveBeenCalledWith(expect.anything(), { verifierId: 'did:key:z6MkVerifier1' })
      expect(result).toHaveLength(1)
      expect(result[0].publicVerifierId).toBe('did:key:z6MkVerifier1')
    })

    test('should return empty array when no verifiers match', async () => {
      mockFindByQuery.mockResolvedValue([])

      const result = await service.find(tenantAgent, 'did:key:z6MkNonExistent')

      expect(mockFindByQuery).toHaveBeenCalledWith(expect.anything(), { verifierId: 'did:key:z6MkNonExistent' })
      expect(result).toHaveLength(0)
    })
  })
})
