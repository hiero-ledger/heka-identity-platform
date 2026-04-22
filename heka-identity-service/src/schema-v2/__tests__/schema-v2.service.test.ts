import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, NotFoundException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { AnoncredsRegistryService } from 'common/anoncreds-registry'
import { Role } from 'common/auth'
import { Schema } from 'common/entities'
import { FileStorageService } from 'common/file-storage/file-storage.service'
import { Logger } from 'common/logger'
import { OCAService } from 'common/oca/oca.service'
import {
  AriesCredentialRegistrationFormat,
  DidMethod,
  OpenId4VCCredentialRegistrationFormat,
  ProtocolType,
} from 'common/types'
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
      vi.mocked(em.findAndCount).mockResolvedValue([mockSchemas as any, 1])
      vi.mocked(fileStorageService.url).mockReturnValue('https://cdn/logo.png')

      const result = await schemaV2Service.getList(authInfo, { offset: 0, limit: 10 })

      expect(em.findAndCount).toHaveBeenCalledWith(Schema, expect.anything(), expect.anything())
      expect(fileStorageService.url).toHaveBeenCalledWith('path/logo.png')
      expect(result.total).toBe(1)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].name).toBe('Test Schema')
      expect(result.items[0].logo).toBe('https://cdn/logo.png')
    })

    test('returns empty list when no schemas', async () => {
      vi.mocked(em.findAndCount).mockResolvedValue([[], 0])

      const result = await schemaV2Service.getList(authInfo, { offset: 0, limit: 10 })

      expect(em.findAndCount).toHaveBeenCalledWith(Schema, expect.anything(), expect.anything())
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
      vi.mocked(em.findOne).mockResolvedValue(mockSchema as any)

      const result = await schemaV2Service.getById(authInfo, 'schema-1')

      expect(em.findOne).toHaveBeenCalledWith(Schema, { owner: mockUser, id: 'schema-1' }, expect.anything())
      expect(result.id).toBe('schema-1')
      expect(result.name).toBe('My Schema')
      expect(result.logo).toBeUndefined()
    })

    test('throws NotFoundException when schema not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null)

      await expect(schemaV2Service.getById(authInfo, 'missing')).rejects.toThrow(NotFoundException)
      expect(em.findOne).toHaveBeenCalledWith(Schema, { owner: mockUser, id: 'missing' }, expect.anything())
    })
  })

  describe('create', () => {
    test('throws BadRequestException when schema name already exists', async () => {
      vi.mocked(em.findOne).mockResolvedValue({ id: 'existing' } as any)

      await expect(schemaV2Service.create(authInfo, { name: 'Duplicate', fields: ['f1'] } as any)).rejects.toThrow(
        BadRequestException,
      )
      expect(em.findOne).toHaveBeenCalledWith(Schema, { owner: mockUser, name: { $eq: 'Duplicate' } })
    })
  })

  describe('registration', () => {
    test('throws NotFoundException when schema not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null)

      await expect(
        schemaV2Service.registration(authInfo, tenantAgent, 'missing', {
          protocol: ProtocolType.Oid4vc,
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(NotFoundException)
      expect(em.findOne).toHaveBeenCalledWith(Schema, { owner: mockUser, id: 'missing' }, expect.anything())
    })

    test('throws BadRequestException when already registered', async () => {
      const mockSchema = { id: 'schema-1', name: 'Test', owner: mockUser, fields: { toArray: () => [] } }
      vi.mocked(em.findOne).mockImplementation((entity: any, filter: any) => {
        if (entity === Schema) return Promise.resolve(mockSchema as any)
        if (filter?.schema) return Promise.resolve({ id: 'existing-reg' } as any)
        return Promise.resolve(null)
      })

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
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === Schema) return Promise.resolve(mockSchema as any)
        return Promise.resolve(null)
      })

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
      const mockReg = { credentials: { supportedCredentialId: 'cred-1' } }
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === Schema) return Promise.resolve(mockSchema as any)
        return Promise.resolve(mockReg as any)
      })

      const result = await schemaV2Service.getRegistration(authInfo, 'schema-1', {
        protocol: ProtocolType.Oid4vc,
        did: 'did:key:z1',
      } as any)

      expect(result.registered).toBe(true)
      expect(result.credentials).toEqual({ supportedCredentialId: 'cred-1' })
    })

    test('returns registered:false when no registration', async () => {
      const mockSchema = { id: 'schema-1' }
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === Schema) return Promise.resolve(mockSchema as any)
        return Promise.resolve(null)
      })

      const result = await schemaV2Service.getRegistration(authInfo, 'schema-1', {
        protocol: ProtocolType.Oid4vc,
        did: 'did:key:z1',
      } as any)

      expect(result.registered).toBe(false)
    })

    test('throws NotFoundException when schema not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null)

      await expect(
        schemaV2Service.getRegistration(authInfo, 'missing', {
          protocol: ProtocolType.Oid4vc,
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(NotFoundException)
      expect(em.findOne).toHaveBeenCalledWith(Schema, { owner: mockUser, id: 'missing' })
    })
  })

  describe('patch', () => {
    test('throws NotFoundException when schema not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null)

      await expect(
        schemaV2Service.patch(authInfo, tenantAgent, 'missing', {} as any, undefined as any),
      ).rejects.toThrow(NotFoundException)
      expect(em.findOne).toHaveBeenCalledWith(Schema, { owner: mockUser, id: 'missing' }, expect.anything())
    })

    test('patches schema bgColor and name fields and refreshes OCA', async () => {
      const mockSchema: any = {
        id: 'schema-1',
        name: 'My Schema',
        logo: null,
        bgColor: '#111',
        isHidden: false,
        orderIndex: 0,
        owner: mockUser,
        fields: { toArray: () => [] },
        registrations: {
          filter: (fn: any) => [].filter(fn),
          map: vi.fn().mockReturnValue([]),
          count: () => 0,
        },
      }

      vi.mocked(em.findOne).mockResolvedValue(mockSchema)
      vi.mocked(em.find).mockResolvedValue([] as any)

      const result = await schemaV2Service.patch(
        authInfo,
        tenantAgent,
        'schema-1',
        { bgColor: '#222' } as any,
        undefined as any,
      )

      expect(mockSchema.bgColor).toBe('#222')
      expect(em.flush).toHaveBeenCalled()
      expect(ocaService.refreshOCAFiles).toHaveBeenCalled()
      expect(result.id).toBe('schema-1')
    })

    test('patches isHidden flag and calls setPlace', async () => {
      const mockSchema: any = {
        id: 'schema-1',
        name: 'My Schema',
        logo: null,
        bgColor: '#111',
        isHidden: false,
        orderIndex: 0,
        owner: mockUser,
        fields: { toArray: () => [] },
        registrations: {
          filter: (fn: any) => [].filter(fn),
          map: vi.fn().mockReturnValue([]),
          count: () => 0,
        },
      }

      vi.mocked(em.findOne).mockResolvedValue(mockSchema)
      vi.mocked(em.find).mockResolvedValue([mockSchema] as any)

      await schemaV2Service.patch(authInfo, tenantAgent, 'schema-1', { isHidden: true } as any, undefined as any)

      expect(mockSchema.isHidden).toBe(true)
      expect(em.flush).toHaveBeenCalled()
    })

    test('patches previousSchemaId to first', async () => {
      const mockSchema: any = {
        id: 'schema-1',
        name: 'My Schema',
        logo: null,
        bgColor: '#111',
        isHidden: false,
        orderIndex: 0,
        owner: mockUser,
        fields: { toArray: () => [] },
        registrations: {
          filter: (fn: any) => [].filter(fn),
          map: vi.fn().mockReturnValue([]),
          count: () => 0,
        },
      }

      vi.mocked(em.findOne).mockResolvedValue(mockSchema)
      vi.mocked(em.find).mockResolvedValue([mockSchema] as any)

      await schemaV2Service.patch(authInfo, tenantAgent, 'schema-1', { previousSchemaId: '' } as any, undefined as any)

      expect(em.flush).toHaveBeenCalled()
    })

    test('patches previousSchemaId to specific ID (after)', async () => {
      const prevSchema: any = {
        id: 'schema-prev',
        name: 'Prev',
        orderIndex: 0,
        isHidden: false,
        owner: mockUser,
      }
      const mockSchema: any = {
        id: 'schema-1',
        name: 'My Schema',
        logo: null,
        bgColor: '#111',
        isHidden: false,
        orderIndex: 1,
        owner: mockUser,
        fields: { toArray: () => [] },
        registrations: {
          filter: (fn: any) => [].filter(fn),
          map: vi.fn().mockReturnValue([]),
          count: () => 0,
        },
      }

      vi.mocked(em.findOne).mockImplementation((entity: any, filter: any) => {
        if (entity === Schema && filter?.id === 'schema-1') return Promise.resolve(mockSchema)
        if (entity === Schema && filter?.id === 'schema-prev') return Promise.resolve(prevSchema)
        return Promise.resolve(null)
      })
      vi.mocked(em.find).mockResolvedValue([prevSchema, mockSchema] as any)

      await schemaV2Service.patch(
        authInfo,
        tenantAgent,
        'schema-1',
        { previousSchemaId: 'schema-prev' } as any,
        undefined as any,
      )

      expect(em.flush).toHaveBeenCalled()
    })

    test('throws BadRequestException when previousSchemaId does not exist', async () => {
      const mockSchema: any = {
        id: 'schema-1',
        name: 'My Schema',
        owner: mockUser,
        fields: { toArray: () => [] },
        registrations: { filter: (fn: any) => [].filter(fn) },
      }
      vi.mocked(em.findOne).mockImplementation((entity: any, filter: any) => {
        if (entity === Schema && filter?.id === 'schema-1') return Promise.resolve(mockSchema)
        return Promise.resolve(null)
      })

      await expect(
        schemaV2Service.patch(
          authInfo,
          tenantAgent,
          'schema-1',
          { previousSchemaId: 'missing-prev' } as any,
          undefined as any,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    test('patches with logoFile and removes existing logo', async () => {
      const mockSchema: any = {
        id: 'schema-1',
        name: 'My Schema',
        logo: 'old/logo.png',
        bgColor: '#111',
        isHidden: false,
        orderIndex: 0,
        owner: mockUser,
        fields: { toArray: () => [] },
        registrations: {
          filter: (fn: any) => [].filter(fn),
          map: vi.fn().mockReturnValue([]),
          count: () => 0,
        },
      }
      const logoFile = { originalname: 'new.png' } as any

      vi.mocked(em.findOne).mockResolvedValue(mockSchema)
      vi.mocked(em.find).mockResolvedValue([] as any)
      vi.mocked(fileStorageService.put).mockResolvedValue('new/logo.png')

      await schemaV2Service.patch(authInfo, tenantAgent, 'schema-1', {} as any, logoFile)

      expect(fileStorageService.remove).toHaveBeenCalledWith('old/logo.png')
      expect(fileStorageService.put).toHaveBeenCalled()
      expect(mockSchema.logo).toBe('new/logo.png')
    })

    test('patches updates Oid4vc registration display when bgColor changes', async () => {
      const registration = { protocol: ProtocolType.Oid4vc, did: 'did:key:z1' }
      const mockSchema: any = {
        id: 'schema-1',
        name: 'My Schema',
        logo: null,
        bgColor: '#111',
        isHidden: false,
        orderIndex: 0,
        owner: mockUser,
        fields: { toArray: () => [] },
        registrations: {
          filter: (fn: any) => [registration].filter(fn),
          map: vi.fn().mockReturnValue([]),
          count: () => 0,
        },
      }

      vi.mocked(em.findOne).mockResolvedValue(mockSchema)
      vi.mocked(em.find).mockResolvedValue([] as any)
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {
          'cred-1': { format: 'vc+sd-jwt', vct: 'My Schema', display: [] },
        },
        display: [{ name: 'Issuer' }],
      } as any)

      await schemaV2Service.patch(authInfo, tenantAgent, 'schema-1', { bgColor: '#333' } as any, undefined as any)

      expect(tenantAgent.openid4vc.issuer.updateIssuerMetadata).toHaveBeenCalled()
    })
  })

  describe('create (happy path)', () => {
    test('creates schema successfully', async () => {
      const createdSchema: any = {
        id: 'schema-new',
        name: 'New Schema',
        logo: null,
        bgColor: '#abc',
        isHidden: false,
        orderIndex: 1,
        owner: mockUser,
        fields: { toArray: () => [{ id: 'f1', name: 'field1', orderIndex: 0 }] },
        registrations: {
          map: vi.fn().mockReturnValue([]),
          count: () => 0,
        },
      }

      // duplicate name check -> null; lastSchema -> null; setPlace finds empty
      vi.mocked(em.findOne).mockResolvedValue(null as any)
      vi.mocked(em.find).mockResolvedValue([] as any)

      vi.mocked(em.persistAndFlush).mockImplementation(() => {
        vi.mocked(em.findOne).mockResolvedValue(createdSchema)
        return Promise.resolve()
      })

      const result = await schemaV2Service.create(authInfo, {
        name: 'New Schema',
        bgColor: '#abc',
        fields: [],
      } as any)

      expect(result.id).toBe('schema-new')
      expect(result.name).toBe('New Schema')
      expect(em.persistAndFlush).toHaveBeenCalled()
    })

    test('creates schema with logoFile', async () => {
      const createdSchema: any = {
        id: 'schema-new',
        name: 'New Schema',
        logo: 'logo/new.png',
        bgColor: '#abc',
        isHidden: false,
        orderIndex: 0,
        owner: mockUser,
        fields: { toArray: () => [] },
        registrations: { map: vi.fn().mockReturnValue([]), count: () => 0 },
      }

      vi.mocked(em.findOne).mockResolvedValue(null as any)
      vi.mocked(em.find).mockResolvedValue([] as any)
      vi.mocked(fileStorageService.put).mockResolvedValue('logo/new.png')
      vi.mocked(fileStorageService.url).mockReturnValue('https://cdn/logo/new.png')

      vi.mocked(em.persistAndFlush).mockImplementation(() => {
        vi.mocked(em.findOne).mockResolvedValue(createdSchema)
        return Promise.resolve()
      })

      const logoFile = { originalname: 'new.png' } as any
      const result = await schemaV2Service.create(
        authInfo,
        { name: 'New Schema', bgColor: '#abc', fields: [] } as any,
        logoFile,
      )

      expect(fileStorageService.put).toHaveBeenCalled()
      expect(result.logo).toBe('https://cdn/logo/new.png')
    })
  })

  describe('registration (happy path)', () => {
    const mockSchemaBase: any = {
      id: 'schema-1',
      name: 'TestSchema',
      owner: mockUser,
      fields: {
        toArray: () => [
          { id: 'f1', name: 'field1', orderIndex: 0 },
          { id: 'f2', name: 'field2', orderIndex: 1 },
        ],
      },
    }

    test('registers Aries Anoncreds schema successfully', async () => {
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === Schema) return Promise.resolve(mockSchemaBase)
        return Promise.resolve(null)
      })

      vi.mocked(anoncredsRegistryService.registerSchema).mockResolvedValue({
        schemaId: 'schema-on-ledger-id',
      } as any)
      vi.mocked(anoncredsRegistryService.registerCredentialDefinition).mockResolvedValue({
        credentialDefinitionId: 'cred-def-1',
      } as any)
      vi.mocked(revocationRegistryService.create).mockResolvedValue({
        revocationRegistryDefinitionId: 'rev-reg-1',
      } as any)

      const result = await schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
        protocol: ProtocolType.Aries,
        credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
        network: DidMethod.Indy,
        did: 'did:indy:test',
      } as any)

      expect(anoncredsRegistryService.registerSchema).toHaveBeenCalled()
      expect(anoncredsRegistryService.registerCredentialDefinition).toHaveBeenCalled()
      expect(revocationRegistryService.create).toHaveBeenCalled()
      expect(em.persistAndFlush).toHaveBeenCalled()
      expect(ocaService.refreshOCAFiles).toHaveBeenCalled()
      expect(result.credentials).toEqual({
        credentialDefinitionId: 'cred-def-1',
        revocationRegistryDefinitionId: 'rev-reg-1',
      })
    })

    test('throws BadRequestException when Aries credentialFormat is unsupported', async () => {
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === Schema) return Promise.resolve(mockSchemaBase)
        return Promise.resolve(null)
      })

      await expect(
        schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
          protocol: ProtocolType.Aries,
          credentialFormat: 'unknown' as any,
          network: DidMethod.Indy,
          did: 'did:indy:test',
        } as any),
      ).rejects.toThrow(BadRequestException)
    })

    const setupOid4vcRegister = (schema = mockSchemaBase) => {
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === Schema) return Promise.resolve(schema)
        return Promise.resolve(null)
      })

      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: {},
        display: [{ name: 'Issuer' }],
      } as any)

      vi.mocked(statusListService.create).mockResolvedValue({ id: 'status-list-1' } as any)
    }

    test('registers Oid4vc SdJwtVc successfully', async () => {
      setupOid4vcRegister()

      const result = await schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
        protocol: ProtocolType.Oid4vc,
        credentialFormat: OpenId4VCCredentialRegistrationFormat.SdJwtVc,
        network: DidMethod.Key,
        did: 'did:key:z1',
      } as any)

      expect(tenantAgent.openid4vc.issuer.updateIssuerMetadata).toHaveBeenCalled()
      expect(statusListService.create).toHaveBeenCalled()
      expect(em.persistAndFlush).toHaveBeenCalled()
      expect(result.credentials).toMatchObject({ statusListId: 'status-list-1' })
    })

    test('registers Oid4vc JwtVcJson successfully', async () => {
      setupOid4vcRegister()

      await schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
        protocol: ProtocolType.Oid4vc,
        credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJson,
        network: DidMethod.Key,
        did: 'did:key:z1',
      } as any)

      expect(tenantAgent.openid4vc.issuer.updateIssuerMetadata).toHaveBeenCalled()
    })

    test('registers Oid4vc JwtVcJsonLd successfully', async () => {
      setupOid4vcRegister()

      await schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
        protocol: ProtocolType.Oid4vc,
        credentialFormat: OpenId4VCCredentialRegistrationFormat.JwtVcJsonLd,
        network: DidMethod.Key,
        did: 'did:key:z1',
      } as any)

      expect(tenantAgent.openid4vc.issuer.updateIssuerMetadata).toHaveBeenCalled()
    })

    test('registers Oid4vc LdpVc successfully', async () => {
      setupOid4vcRegister()

      await schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
        protocol: ProtocolType.Oid4vc,
        credentialFormat: OpenId4VCCredentialRegistrationFormat.LdpVc,
        network: DidMethod.Key,
        did: 'did:key:z1',
      } as any)

      expect(tenantAgent.openid4vc.issuer.updateIssuerMetadata).toHaveBeenCalled()
    })

    test('registers Oid4vc MsoMdoc successfully', async () => {
      setupOid4vcRegister()

      await schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
        protocol: ProtocolType.Oid4vc,
        credentialFormat: OpenId4VCCredentialRegistrationFormat.MsoMdoc,
        network: DidMethod.Key,
        did: 'did:key:z1',
      } as any)

      expect(tenantAgent.openid4vc.issuer.updateIssuerMetadata).toHaveBeenCalled()
    })

    test('registers Oid4vc with schema that has a logo (uses fileStorage.url in display)', async () => {
      const schemaWithLogo = {
        ...mockSchemaBase,
        logo: 'path/to/logo.png',
        bgColor: '#fff',
      }
      setupOid4vcRegister(schemaWithLogo)
      vi.mocked(fileStorageService.url).mockReturnValue('https://cdn/logo.png')

      await schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
        protocol: ProtocolType.Oid4vc,
        credentialFormat: OpenId4VCCredentialRegistrationFormat.SdJwtVc,
        network: DidMethod.Key,
        did: 'did:key:z1',
      } as any)

      expect(fileStorageService.url).toHaveBeenCalledWith('path/to/logo.png')
    })

    test('throws BadRequestException when Oid4vc schema already registered in issuer metadata', async () => {
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === Schema) return Promise.resolve(mockSchemaBase)
        return Promise.resolve(null)
      })

      const supportedCredentialId = `${mockSchemaBase.name}:${DidMethod.Key}:${OpenId4VCCredentialRegistrationFormat.SdJwtVc}`
      vi.mocked(tenantAgent.openid4vc.issuer.getIssuerByIssuerId).mockResolvedValue({
        issuerId: 'issuer-1',
        credentialConfigurationsSupported: { [supportedCredentialId]: { format: 'vc+sd-jwt' } },
        display: [],
      } as any)

      await expect(
        schemaV2Service.registration(authInfo, tenantAgent, 'schema-1', {
          protocol: ProtocolType.Oid4vc,
          credentialFormat: OpenId4VCCredentialRegistrationFormat.SdJwtVc,
          network: DidMethod.Key,
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('getList with filters', () => {
    test('applies text filter and isHidden filter', async () => {
      vi.mocked(em.findAndCount).mockResolvedValue([[], 0])

      const result = await schemaV2Service.getList(authInfo, {
        offset: 0,
        limit: 10,
        text: 'hello',
        isHidden: true,
      } as any)

      expect(result.total).toBe(0)
      expect(em.findAndCount).toHaveBeenCalled()
      const call = vi.mocked(em.findAndCount).mock.calls[0]
      // filter contains $or with $and of all three conditions
      expect(call[1]).toHaveProperty('$or')
    })
  })
})
