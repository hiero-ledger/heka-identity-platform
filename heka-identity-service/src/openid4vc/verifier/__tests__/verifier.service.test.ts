import { createMock } from '@golevelup/ts-vitest'
import { ConflictException } from '@nestjs/common'
import { when } from 'vitest-when'

import { TenantAgent } from 'common/agent'

import { OpenId4VcVerifierService } from '../verifier.service'

describe('OpenId4VcVerifierService', () => {
  let service: OpenId4VcVerifierService
  let tenantAgent: TenantAgent

  const mockFindByQuery = vi.fn()
  const mockCreateVerifier = vi.fn()

  beforeEach(() => {
    service = new OpenId4VcVerifierService()
    mockFindByQuery.mockReset()
    mockCreateVerifier.mockReset()

    tenantAgent = createMock<TenantAgent>({
      openid4vc: {
        verifier: {
          createVerifier: mockCreateVerifier,
        },
      } as any,
      dependencyManager: {
        resolve: vi.fn().mockReturnValue({
          findByQuery: mockFindByQuery,
        }),
      } as any,
      context: {} as any,
    })
  })

  describe('createVerifier', () => {
    test('should create a verifier when no duplicate exists', async () => {
      const options = { publicVerifierId: 'did:key:z6MkVerifier1' } as any

      when(mockFindByQuery).calledWith(expect.anything(), { verifierId: 'did:key:z6MkVerifier1' }).thenResolve([])

      const mockVerifierRecord = {
        id: 'record-1',
        verifierId: 'did:key:z6MkVerifier1',
        type: 'OpenId4VcVerifierRecord',
        createdAt: new Date(),
      }

      when(mockCreateVerifier).calledWith({ verifierId: 'did:key:z6MkVerifier1' }).thenResolve(mockVerifierRecord)

      const result = await service.createVerifier(tenantAgent, options)

      expect(result.publicVerifierId).toBe('did:key:z6MkVerifier1')
    })

    test('should throw ConflictException if verifier already exists', async () => {
      const options = { publicVerifierId: 'did:key:z6MkVerifier1' } as any

      when(mockFindByQuery)
        .calledWith(expect.anything(), { verifierId: 'did:key:z6MkVerifier1' })
        .thenResolve([{ verifierId: 'did:key:z6MkVerifier1' }])

      await expect(service.createVerifier(tenantAgent, options)).rejects.toThrow(ConflictException)
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

      when(mockFindByQuery)
        .calledWith(expect.anything(), { verifierId: 'did:key:z6MkVerifier1' })
        .thenResolve(mockVerifiers)

      const result = await service.find(tenantAgent, 'did:key:z6MkVerifier1')

      expect(result).toHaveLength(1)
      expect(result[0].publicVerifierId).toBe('did:key:z6MkVerifier1')
    })

    test('should return empty array when no verifiers match', async () => {
      when(mockFindByQuery).calledWith(expect.anything(), { verifierId: 'did:key:z6MkNonExistent' }).thenResolve([])

      const result = await service.find(tenantAgent, 'did:key:z6MkNonExistent')

      expect(result).toHaveLength(0)
    })
  })
})
