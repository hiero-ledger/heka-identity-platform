import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { entityStub } from '../../../../test/helpers/mock-records'
import { AuthInfo, Role } from '../../../common/auth'
import { CredentialStatusList, StatusListPurpose } from '../../../common/entities/credential-status-list.entity'
import ExpressConfig from '../../../config/express'
import { StatusListService } from '../status-list.service'

// Mock the Bitstring module
const { mockEncodeBits, mockSet, MockBitstring } = vi.hoisted(() => {
  const mockEncodeBits = vi.fn().mockResolvedValue('encoded-bitstring')
  const mockSet = vi.fn()
  const mockDecodeBits = vi.fn().mockResolvedValue(Buffer.alloc(100))

  const MockBitstring = Object.assign(
    vi.fn().mockImplementation(() => ({
      encodeBits: mockEncodeBits,
      set: mockSet,
    })),
    { decodeBits: mockDecodeBits },
  )

  return { mockEncodeBits, mockSet, mockDecodeBits, MockBitstring }
})

vi.mock('@digitalcredentials/bitstring', () => ({
  Bitstring: MockBitstring,
}))

describe('StatusListService', () => {
  let service: StatusListService
  let em: EntityManager
  let appConfig: ConfigType<typeof ExpressConfig>

  const appEndpoint = 'https://api.example.com'

  const mockUser = { id: 'user-1', name: 'Test User' } as any
  const authInfo: AuthInfo = {
    userId: 'user-1',
    user: mockUser,
    userName: 'testuser',
    role: Role.Issuer,
    orgId: 'org-1',
    walletId: 'wallet-1',
    tenantId: 'tenant-1',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockEncodeBits.mockResolvedValue('encoded-bitstring')

    em = createMock<EntityManager>()
    appConfig = createMock<ConfigType<typeof ExpressConfig>>({
      appEndpoint,
    })

    service = new StatusListService(em, appConfig)
  })

  describe('create', () => {
    test('should create a status list with default size', async () => {
      const req = { issuer: 'did:example:issuer' }

      vi.mocked(em.persistAndFlush).mockResolvedValue(undefined as any)

      const result = await service.create(authInfo, req)

      expect(result).toBeInstanceOf(CredentialStatusList)
      expect(result.issuer).toBe('did:example:issuer')
      expect(result.encodedList).toBe('encoded-bitstring')
      expect(result.size).toBe(100)
      expect(result.purpose).toBe(StatusListPurpose.Revocation)
      expect(result.owner).toBe(mockUser)
      expect(em.persistAndFlush).toHaveBeenCalledWith(result)
    })

    test('should create a status list with custom size and purpose', async () => {
      const req = {
        issuer: 'did:example:issuer',
        size: 500,
        purpose: StatusListPurpose.Suspension,
      }

      vi.mocked(em.persistAndFlush).mockResolvedValue(undefined as any)

      const result = await service.create(authInfo, req)

      expect(result.size).toBe(500)
      expect(result.purpose).toBe(StatusListPurpose.Suspension)
    })
  })

  describe('get', () => {
    test('should return a StatusList for the given id', async () => {
      const id = 'status-list-1'
      const statusListEntity = entityStub<CredentialStatusList>({
        id,
        encodedList: 'encoded-data',
        lastIndex: 5,
        purpose: StatusListPurpose.Revocation,
        size: 100,
      })

      vi.mocked(em.findOneOrFail).mockResolvedValue(statusListEntity)

      const result = await service.get(authInfo, id)

      expect(em.findOneOrFail).toHaveBeenCalledWith(CredentialStatusList, { id, owner: mockUser })
      expect(result.encodedList).toBe('encoded-data')
      expect(result.lastIndex).toBe(5)
      expect(result.purpose).toBe(StatusListPurpose.Revocation)
      expect(result.size).toBe(100)
    })

    test('should propagate error when entity is not found', async () => {
      const id = 'nonexistent-id'

      vi.mocked(em.findOneOrFail).mockRejectedValue(new Error('Entity not found'))

      await expect(service.get(authInfo, id)).rejects.toThrow('Entity not found')
      expect(em.findOneOrFail).toHaveBeenCalledWith(CredentialStatusList, { id, owner: mockUser })
    })
  })

  describe('find', () => {
    test('should return an array of StatusList objects', async () => {
      const entities = [
        entityStub<CredentialStatusList>({
          encodedList: 'encoded-1',
          lastIndex: 3,
          purpose: StatusListPurpose.Revocation,
          size: 100,
        }),
        entityStub<CredentialStatusList>({
          encodedList: 'encoded-2',
          lastIndex: 7,
          purpose: StatusListPurpose.Suspension,
          size: 200,
        }),
      ]

      vi.mocked(em.find).mockResolvedValue(entities)

      const result = await service.find(authInfo)

      expect(em.find).toHaveBeenCalledWith(CredentialStatusList, { owner: mockUser })
      expect(result).toHaveLength(2)
      expect(result[0].encodedList).toBe('encoded-1')
      expect(result[0].lastIndex).toBe(3)
      expect(result[1].encodedList).toBe('encoded-2')
      expect(result[1].size).toBe(200)
    })

    test('should return empty array when no status lists found', async () => {
      vi.mocked(em.find).mockResolvedValue([])

      const result = await service.find(authInfo)

      expect(result).toEqual([])
    })
  })

  describe('getOrCreate', () => {
    const issuer = 'did:example:issuer'

    test('should return existing list when one has available capacity', async () => {
      const existingList = entityStub<CredentialStatusList>({
        id: 'list-1',
        lastIndex: 50,
        size: 100,
        issuer,
        encodedList: 'encoded',
        purpose: StatusListPurpose.Revocation,
        owner: mockUser,
      })

      vi.mocked(em.find).mockResolvedValue([existingList])

      const result = await service.getOrCreate(authInfo, issuer)

      expect(result).toBe(existingList)
      expect(em.persistAndFlush).not.toHaveBeenCalled()
    })

    test('should create new list when all existing lists are full', async () => {
      const fullList = entityStub<CredentialStatusList>({
        id: 'list-1',
        lastIndex: 100,
        size: 100,
        issuer,
        encodedList: 'encoded',
        purpose: StatusListPurpose.Revocation,
        owner: mockUser,
      })

      vi.mocked(em.find).mockResolvedValue([fullList])
      vi.mocked(em.persistAndFlush).mockResolvedValue(undefined as any)

      const result = await service.getOrCreate(authInfo, issuer)

      expect(result).toBeInstanceOf(CredentialStatusList)
      expect(result.issuer).toBe(issuer)
      expect(em.persistAndFlush).toHaveBeenCalled()
    })

    test('should create new list when no existing lists found', async () => {
      vi.mocked(em.find).mockResolvedValue([])
      vi.mocked(em.persistAndFlush).mockResolvedValue(undefined as any)

      const result = await service.getOrCreate(authInfo, issuer)

      expect(result).toBeInstanceOf(CredentialStatusList)
      expect(em.persistAndFlush).toHaveBeenCalled()
    })
  })

  describe('addItems', () => {
    test('should update the encoded list and last index', async () => {
      const id = 'status-list-1'
      const statusListEntity = entityStub<CredentialStatusList>({
        id,
        encodedList: 'original-encoded',
        lastIndex: 5,
        size: 100,
        owner: mockUser,
      })

      vi.mocked(em.findOneOrFail).mockResolvedValue(statusListEntity)

      mockEncodeBits.mockResolvedValue('updated-encoded')

      await service.addItems(authInfo, id, [5, 6, 7])

      expect(em.findOneOrFail).toHaveBeenCalledWith(CredentialStatusList, { id, owner: mockUser })
      expect(statusListEntity.encodedList).toBe('updated-encoded')
      expect(statusListEntity.lastIndex).toBe(8) // 5 + 3
      expect(em.flush).toHaveBeenCalled()
    })

    test('should propagate error when entity not found', async () => {
      vi.mocked(em.findOneOrFail).mockRejectedValue(new Error('Entity not found'))

      await expect(service.addItems(authInfo, 'bad-id', [0])).rejects.toThrow('Entity not found')
      expect(em.findOneOrFail).toHaveBeenCalledWith(CredentialStatusList, { id: 'bad-id', owner: mockUser })
    })
  })

  describe('updateItems', () => {
    test('should update status list items to revoked', async () => {
      const id = 'status-list-1'
      const statusListEntity = entityStub<CredentialStatusList>({
        id,
        encodedList: 'original-encoded',
        lastIndex: 10,
        size: 100,
        owner: mockUser,
      })

      vi.mocked(em.findOneOrFail).mockResolvedValue(statusListEntity)

      mockEncodeBits.mockResolvedValue('revoked-encoded')

      await service.updateItems(authInfo, id, { indexes: [2, 5], revoked: true })

      expect(statusListEntity.encodedList).toBe('revoked-encoded')
      expect(mockSet).toHaveBeenCalledWith(2, true)
      expect(mockSet).toHaveBeenCalledWith(5, true)
      expect(em.flush).toHaveBeenCalled()
    })

    test('should update status list items to unrevoked', async () => {
      const id = 'status-list-1'
      const statusListEntity = entityStub<CredentialStatusList>({
        id,
        encodedList: 'original-encoded',
        lastIndex: 10,
        size: 100,
        owner: mockUser,
      })

      vi.mocked(em.findOneOrFail).mockResolvedValue(statusListEntity)

      mockEncodeBits.mockResolvedValue('unrevoked-encoded')

      await service.updateItems(authInfo, id, { indexes: [2], revoked: false })

      expect(statusListEntity.encodedList).toBe('unrevoked-encoded')
      expect(mockSet).toHaveBeenCalledWith(2, false)
    })

    test('should throw BadRequestException when index is out of bounds', async () => {
      const id = 'status-list-1'
      const statusListEntity = entityStub<CredentialStatusList>({
        id,
        encodedList: 'original-encoded',
        lastIndex: 10,
        size: 100,
        owner: mockUser,
      })

      vi.mocked(em.findOneOrFail).mockResolvedValue(statusListEntity)

      // decodeBits returns a buffer of length 100, so index 200 is out of bounds
      // The service checks `index > decodedList.length`
      // Buffer.alloc(100) has length 100, so index 200 > 100
      await expect(service.updateItems(authInfo, id, { indexes: [200], revoked: true })).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  describe('getItemDetails', () => {
    test('should return credential status list response', async () => {
      const id = 'status-list-1'
      const statusListEntity = entityStub<CredentialStatusList>({
        id,
        issuer: 'did:example:issuer',
        purpose: StatusListPurpose.Revocation,
        encodedList: 'encoded-data',
      })

      vi.mocked(em.findOneOrFail).mockResolvedValue(statusListEntity)

      const result = await service.getItemDetails(id)

      expect(em.findOneOrFail).toHaveBeenCalledWith(CredentialStatusList, { id })
      expect(result).toEqual({
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiableCredential', 'BitstringStatusListCredential'],
        id,
        issuer: 'did:example:issuer',
        validFrom: expect.any(String),
        credentialSubject: {
          id,
          type: 'BitstringStatusList',
          statusPurpose: StatusListPurpose.Revocation,
          encodedList: 'encoded-data',
        },
      })
    })

    test('should propagate error when entity not found', async () => {
      vi.mocked(em.findOneOrFail).mockRejectedValue(new Error('Entity not found'))

      await expect(service.getItemDetails('bad-id')).rejects.toThrow('Entity not found')
      expect(em.findOneOrFail).toHaveBeenCalledWith(CredentialStatusList, { id: 'bad-id' })
    })
  })

  describe('location', () => {
    test('should return the correct status list URL', () => {
      const id = 'status-list-1'

      const result = service.location(id)

      expect(result).toBe(`${appEndpoint}/credentials/status/${id}`)
    })
  })
})
