import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { when } from 'vitest-when'

import { TenantAgent } from 'common/agent'
import { AnoncredsRegistryService } from 'common/anoncreds-registry'
import { Role } from 'common/auth'
import { Schema } from 'common/entities'
import { FileStorageService } from 'common/file-storage/file-storage.service'
import { Logger } from 'common/logger'
import { OCAService } from 'common/oca/oca.service'
import { ProtocolType } from 'common/types'
import { RevocationRegistryService } from 'revocation/revocation-registry/revocation-registry.service'
import { StatusListService } from 'revocation/status-list/status-list.service'

import { SchemaV2Service } from '../schema-v2.service'

describe('SchemaV2Service', () => {
  let schemaV2Service: SchemaV2Service
  let logger: Logger
  let em: EntityManager
  let fileStorageService: FileStorageService
  let anoncredsRegistryService: AnoncredsRegistryService
  let revocationRegistryService: RevocationRegistryService
  let statusListService: StatusListService
  let ocaService: OCAService
  let tenantAgent: TenantAgent

  const mockUser = { id: 'user-1', name: 'Test User' }
  const authInfo = {
    userId: 'user-1',
    user: mockUser as any,
    userName: 'testuser',
    role: Role.Admin,
    orgId: '1',
    walletId: 'Administration_user-1',
    tenantId: 'tenant-1',
  }

  beforeEach(() => {
    logger = createMock<Logger>()
    em = createMock<EntityManager>()
    fileStorageService = createMock<FileStorageService>()
    anoncredsRegistryService = createMock<AnoncredsRegistryService>()
    revocationRegistryService = createMock<RevocationRegistryService>()
    statusListService = createMock<StatusListService>()
    ocaService = createMock<OCAService>()
    schemaV2Service = new SchemaV2Service(
      logger,
      em,
      fileStorageService,
      anoncredsRegistryService,
      revocationRegistryService,
      statusListService,
      ocaService,
    )
    tenantAgent = createMock<TenantAgent>({
      openid4vc: {
        issuer: { getIssuerByIssuerId: vi.fn(), updateIssuerMetadata: vi.fn() },
      } as any,
    })
  })

  describe('getList', () => {
    test('returns paginated schema list', async () => {
      const mockFields = {
        toArray: () => [{ id: 'f1', name: 'field1', orderIndex: 0 }],
      }
      const mockRegistrations = {
        count: () => 1,
        map: vi.fn().mockReturnValue([{ protocol: 'Oid4vc', credentialFormat: 'SdJwtVc', did: 'did:key:z1' }]),
      }
      const mockSchemas = [
        {
          id: 'schema-1',
          name: 'Test Schema',
          logo: 'path/logo.png',
          bgColor: '#fff',
          isHidden: false,
          orderIndex: 0,
          owner: mockUser,
          fields: mockFields,
          registrations: mockRegistrations,
        },
      ]
      when(em.findAndCount)
        .calledWith(Schema, expect.anything(), expect.anything())
        .thenResolve([mockSchemas as any, 1])

      when(fileStorageService.url).calledWith('path/logo.png').thenReturn('https://cdn/logo.png')

      const result = await schemaV2Service.getList(authInfo, { offset: 0, limit: 10 })

      expect(result.total).toBe(1)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].name).toBe('Test Schema')
      expect(result.items[0].logo).toBe('https://cdn/logo.png')
    })

    test('returns empty list when no schemas', async () => {
      when(em.findAndCount).calledWith(Schema, expect.anything(), expect.anything()).thenResolve([[], 0])

      const result = await schemaV2Service.getList(authInfo, { offset: 0, limit: 10 })

      expect(result.total).toBe(0)
      expect(result.items).toHaveLength(0)
    })
  })

  describe('getById', () => {
    test('returns schema by ID', async () => {
      const mockSchema = {
        id: 'schema-1',
        name: 'My Schema',
        logo: null,
        bgColor: '#eee',
        isHidden: false,
        orderIndex: 0,
        owner: mockUser,
        fields: { toArray: () => [{ id: 'f1', name: 'name', orderIndex: 0 }] },
        registrations: {
          map: vi.fn().mockReturnValue([]),
          count: () => 0,
        },
      }
      when(em.findOne)
        .calledWith(Schema, { owner: mockUser, id: 'schema-1' }, expect.anything())
        .thenResolve(mockSchema as any)

      const result = await schemaV2Service.getById(authInfo, 'schema-1')

      expect(result.id).toBe('schema-1')
      expect(result.name).toBe('My Schema')
      expect(result.logo).toBeUndefined()
    })

    test('throws NotFoundException when schema not found', async () => {
      when(em.findOne).calledWith(Schema, { owner: mockUser, id: 'missing' }, expect.anything()).thenResolve(null)

      await expect(schemaV2Service.getById(authInfo, 'missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('create', () => {
    test('throws BadRequestException when schema name already exists', async () => {
      when(em.findOne)
        .calledWith(Schema, { owner: mockUser, name: { $eq: 'Duplicate' } })
        .thenResolve({ id: 'existing' } as any)

      await expect(schemaV2Service.create(authInfo, { name: 'Duplicate', fields: ['f1'] } as any)).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  describe('registration', () => {
    test('throws NotFoundException when schema not found', async () => {
      when(em.findOne).calledWith(Schema, { owner: mockUser, id: 'missing' }, expect.anything()).thenResolve(null)

      await expect(
        schemaV2Service.registration(authInfo, tenantAgent, 'missing', {
          protocol: ProtocolType.Oid4vc,
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(NotFoundException)
    })

    test('throws BadRequestException when already registered', async () => {
      const mockSchema = { id: 'schema-1', name: 'Test', owner: mockUser, fields: { toArray: () => [] } }
      // findOne for schema lookup
      when(em.findOne)
        .calledWith(Schema, { owner: mockUser, id: 'schema-1' }, expect.anything())
        .thenResolve(mockSchema as any)
      // findOne for registration check
      when(em.findOne)
        .calledWith(expect.anything(), expect.objectContaining({ schema: mockSchema }))
        .thenResolve({ id: 'existing-reg' } as any)

      await expect(
        schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
          protocol: ProtocolType.Oid4vc,
          credentialFormat: 'SdJwtVc',
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(BadRequestException)
    })

    test('throws BadRequestException for unsupported protocol', async () => {
      const mockSchema = { id: 'schema-1', name: 'Test', owner: mockUser, fields: { toArray: () => [] } }
      when(em.findOne)
        .calledWith(Schema, { owner: mockUser, id: 'schema-1' }, expect.anything())
        .thenResolve(mockSchema as any)
      when(em.findOne)
        .calledWith(expect.anything(), expect.objectContaining({ schema: mockSchema }))
        .thenResolve(null)

      await expect(
        schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
          protocol: 'Unknown' as any,
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('getRegistration', () => {
    test('returns registered:true when registration exists', async () => {
      const mockSchema = { id: 'schema-1' }
      when(em.findOne)
        .calledWith(Schema, { owner: mockUser, id: 'schema-1' })
        .thenResolve(mockSchema as any)

      const mockReg = { credentials: { supportedCredentialId: 'cred-1' } }
      when(em.findOne)
        .calledWith(expect.anything(), expect.objectContaining({ schema: mockSchema }))
        .thenResolve(mockReg as any)

      const result = await schemaV2Service.getRegistration(authInfo, 'schema-1', {
        protocol: ProtocolType.Oid4vc,
        did: 'did:key:z1',
      } as any)

      expect(result.registered).toBe(true)
      expect(result.credentials).toEqual({ supportedCredentialId: 'cred-1' })
    })

    test('returns registered:false when no registration', async () => {
      const mockSchema = { id: 'schema-1' }
      when(em.findOne)
        .calledWith(Schema, { owner: mockUser, id: 'schema-1' })
        .thenResolve(mockSchema as any)
      when(em.findOne)
        .calledWith(expect.anything(), expect.objectContaining({ schema: mockSchema }))
        .thenResolve(null)

      const result = await schemaV2Service.getRegistration(authInfo, 'schema-1', {
        protocol: ProtocolType.Oid4vc,
        did: 'did:key:z1',
      } as any)

      expect(result.registered).toBe(false)
    })

    test('throws NotFoundException when schema not found', async () => {
      when(em.findOne).calledWith(Schema, { owner: mockUser, id: 'missing' }).thenResolve(null)

      await expect(
        schemaV2Service.getRegistration(authInfo, 'missing', {
          protocol: ProtocolType.Oid4vc,
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('patch', () => {
    test('throws NotFoundException when schema not found', async () => {
      when(em.findOne).calledWith(Schema, { owner: mockUser, id: 'missing' }, expect.anything()).thenResolve(null)

      await expect(
        schemaV2Service.patch(authInfo, tenantAgent, 'missing', {} as any, undefined as any),
      ).rejects.toThrow(NotFoundException)
    })
  })
})
