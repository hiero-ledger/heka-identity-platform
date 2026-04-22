import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, NotFoundException } from '@nestjs/common'

import { Role } from 'common/auth'
import { IssuanceTemplate, Schema } from 'common/entities'
import { FileStorageService } from 'common/file-storage/file-storage.service'
import { Logger } from 'common/logger'

import { IssuanceTemplateService } from '../issuance-template.service'

describe('IssuanceTemplateService', () => {
  let service: IssuanceTemplateService
  let em: EntityManager
  let logger: Logger
  let fileStorageService: FileStorageService

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
    service = new IssuanceTemplateService(logger, em, fileStorageService)
  })

  describe('getTemplateById', () => {
    test('returns template with populated schema and fields', async () => {
      const mockTemplate = {
        id: 'tpl-1',
        name: 'My Template',
        isPinned: false,
        orderIndex: 0,
        protocol: 'Oid4vc',
        credentialFormat: 'SdJwtVc',
        network: 'key',
        did: 'did:key:z1',
        schema: {
          id: 'schema-1',
          name: 'Test Schema',
          logo: 'path/logo.png',
          bgColor: '#fff',
          fields: { toArray: () => [{ id: 'f1', name: 'field1', orderIndex: 0 }] },
          registrations: { map: vi.fn().mockReturnValue([{ protocol: 'Oid4vc', did: 'did:key:z1' }]) },
        },
        fields: {
          map: vi.fn().mockReturnValue([{ id: 'tf1', schemaFieldId: 'f1', schemaFieldName: 'field1', value: 'val1' }]),
        },
      }
      vi.mocked(em.findOne).mockResolvedValue(mockTemplate as any)
      vi.mocked(fileStorageService.url).mockReturnValue('https://cdn/logo.png')

      const result = await service.getTemplateById(authInfo, 'tpl-1')

      expect(em.findOne).toHaveBeenCalledWith(IssuanceTemplate, { owner: mockUser, id: 'tpl-1' }, expect.anything())
      expect(fileStorageService.url).toHaveBeenCalledWith('path/logo.png')
      expect(result.id).toBe('tpl-1')
      expect(result.name).toBe('My Template')
      expect(result.schema.logo).toBe('https://cdn/logo.png')
      expect(result.schema.fields).toHaveLength(1)
    })

    test('throws NotFoundException when template not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null)

      await expect(service.getTemplateById(authInfo, 'missing')).rejects.toThrow(NotFoundException)
      expect(em.findOne).toHaveBeenCalledWith(IssuanceTemplate, { owner: mockUser, id: 'missing' }, expect.anything())
    })

    test('returns undefined logo when schema has no logo', async () => {
      const mockTemplate = {
        id: 'tpl-2',
        name: 'No Logo',
        isPinned: false,
        orderIndex: 0,
        protocol: 'Oid4vc',
        credentialFormat: 'SdJwtVc',
        network: 'key',
        did: 'did:key:z1',
        schema: {
          id: 'schema-2',
          name: 'Schema',
          logo: null,
          bgColor: null,
          fields: { toArray: () => [] },
          registrations: { map: vi.fn().mockReturnValue([]) },
        },
        fields: { map: vi.fn().mockReturnValue([]) },
      }
      vi.mocked(em.findOne).mockResolvedValue(mockTemplate as any)

      const result = await service.getTemplateById(authInfo, 'tpl-2')

      expect(em.findOne).toHaveBeenCalledWith(IssuanceTemplate, { owner: mockUser, id: 'tpl-2' }, expect.anything())
      expect(result.schema.logo).toBeUndefined()
    })
  })

  describe('getList', () => {
    test('returns paginated template list', async () => {
      const mockItems = [
        {
          id: 'tpl-1',
          name: 'Template 1',
          isPinned: false,
          orderIndex: 0,
          protocol: 'Oid4vc',
          credentialFormat: 'SdJwtVc',
          network: 'key',
          did: 'did:key:z1',
          schema: {
            id: 'schema-1',
            name: 'Schema 1',
            logo: null,
            bgColor: null,
            fields: { toArray: () => [{ id: 'f1', name: 'field1', orderIndex: 0 }] },
            registrations: { map: vi.fn().mockReturnValue([]) },
          },
          fields: { map: vi.fn().mockReturnValue([]) },
        },
      ]
      vi.mocked(em.findAndCount).mockResolvedValue([mockItems as any, 1])

      const result = await service.getList(authInfo, { offset: 0, limit: 10 })

      expect(em.findAndCount).toHaveBeenCalledWith(IssuanceTemplate, expect.anything(), expect.anything())
      expect(result.total).toBe(1)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].name).toBe('Template 1')
    })
  })

  describe('create', () => {
    test('throws BadRequestException when template name already exists', async () => {
      vi.mocked(em.findOne).mockResolvedValue({ id: 'existing' } as any)

      await expect(service.create(authInfo, { name: 'Duplicate' } as any)).rejects.toThrow(BadRequestException)
      expect(em.findOne).toHaveBeenCalledWith(
        IssuanceTemplate,
        { owner: mockUser, name: 'Duplicate' },
        expect.anything(),
      )
    })

    test('throws NotFoundException when schema not found', async () => {
      // findOne returns null for both template name check and schema lookup
      vi.mocked(em.findOne).mockResolvedValue(null as any)

      await expect(service.create(authInfo, { name: 'New', schemaId: 'bad-schema' } as any)).rejects.toThrow(
        NotFoundException,
      )
    })

    test('throws BadRequestException when schema not registered for protocol/format/network/did', async () => {
      const mockSchema = {
        id: 'schema-1',
        fields: [{ id: 'f1', name: 'field1' }],
        registrations: { find: vi.fn().mockReturnValue(undefined) },
      }
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === IssuanceTemplate) return Promise.resolve(null)
        if (entity === Schema) return Promise.resolve(mockSchema as any)
        return Promise.resolve(null)
      })

      await expect(
        service.create(authInfo, {
          name: 'New',
          schemaId: 'schema-1',
          protocol: 'Oid4vc',
          credentialFormat: 'SdJwtVc',
          network: 'key',
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(BadRequestException)
    })

    test('throws BadRequestException when field IDs are not unique', async () => {
      const mockSchema = {
        id: 'schema-1',
        fields: [{ id: 'f1', name: 'field1' }],
        registrations: { find: vi.fn().mockReturnValue({ id: 'reg-1' }) },
      }
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === IssuanceTemplate) return Promise.resolve(null)
        if (entity === Schema) return Promise.resolve(mockSchema as any)
        return Promise.resolve(null)
      })

      await expect(
        service.create(authInfo, {
          name: 'New',
          schemaId: 'schema-1',
          protocol: 'Oid4vc',
          credentialFormat: 'SdJwtVc',
          network: 'key',
          did: 'did:key:z1',
          fields: [{ schemaFieldId: 'f1' }, { schemaFieldId: 'f1' }],
        } as any),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('create - validation', () => {
    test('throws BadRequestException when field IDs not in schema', async () => {
      vi.mocked(em.findOne).mockImplementation((entity: any, filter: any) => {
        if (entity === IssuanceTemplate) return Promise.resolve(null)
        if (entity === Schema)
          return Promise.resolve({
            id: 'schema-1',
            fields: [{ id: 'f1', name: 'field1' }],
            registrations: { find: vi.fn().mockReturnValue({ id: 'reg-1' }) },
          } as any)
        return Promise.resolve(null)
      })

      await expect(
        service.create(authInfo, {
          name: 'New',
          schemaId: 'schema-1',
          protocol: 'Oid4vc',
          credentialFormat: 'SdJwtVc',
          network: 'key',
          did: 'did:key:z1',
          fields: [{ schemaFieldId: 'nonexistent' }],
        } as any),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('delete', () => {
    test('deletes template and its fields', async () => {
      const mockTemplate = {
        id: 'tpl-1',
        fields: { removeAll: vi.fn() },
      }
      vi.mocked(em.findOne).mockResolvedValue(mockTemplate as any)

      await service.delete(authInfo, 'tpl-1')

      expect(em.findOne).toHaveBeenCalledWith(IssuanceTemplate, { id: 'tpl-1', owner: mockUser }, expect.anything())
      expect(mockTemplate.fields.removeAll).toHaveBeenCalled()
      expect(em.remove).toHaveBeenCalledWith(mockTemplate)
      expect(em.flush).toHaveBeenCalled()
    })

    test('throws NotFoundException when template not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null)

      await expect(service.delete(authInfo, 'missing')).rejects.toThrow(NotFoundException)
      expect(em.findOne).toHaveBeenCalledWith(IssuanceTemplate, { id: 'missing', owner: mockUser }, expect.anything())
    })
  })

  describe('patch - schema validation', () => {
    test('throws NotFoundException when new schemaId not found', async () => {
      const mockTemplate = {
        id: 'tpl-1',
        name: 'Template',
        owner: mockUser,
        schema: { id: 'old-schema' },
        fields: { length: 0 },
      }
      vi.mocked(em.findOne).mockImplementation((entity: any, filter: any) => {
        if (entity === IssuanceTemplate && filter?.id === 'tpl-1') return Promise.resolve(mockTemplate as any)
        if (entity === Schema) return Promise.resolve(null) // schema not found
        return Promise.resolve(null)
      })

      await expect(service.patch(authInfo, 'tpl-1', { schemaId: 'nonexistent-schema' } as any)).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('patch', () => {
    test('throws NotFoundException when template not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null)

      await expect(service.patch(authInfo, 'missing', {} as any)).rejects.toThrow(NotFoundException)
      expect(em.findOne).toHaveBeenCalledWith(IssuanceTemplate, { id: 'missing', owner: mockUser }, expect.anything())
    })

    test('throws BadRequestException when new name already exists', async () => {
      const mockTemplate = {
        id: 'tpl-1',
        name: 'Old Name',
        owner: mockUser,
        isPinned: false,
        schema: { id: 'schema-1', fields: [] },
        fields: { length: 0, removeAll: vi.fn() },
      }
      vi.mocked(em.findOne)
        .mockResolvedValueOnce(mockTemplate as any)
        .mockResolvedValueOnce({ id: 'other-tpl' } as any)

      await expect(service.patch(authInfo, 'tpl-1', { name: 'Taken Name' } as any)).rejects.toThrow(BadRequestException)
      expect(em.findOne).toHaveBeenNthCalledWith(
        1,
        IssuanceTemplate,
        { id: 'tpl-1', owner: mockUser },
        expect.anything(),
      )
      expect(em.findOne).toHaveBeenNthCalledWith(2, IssuanceTemplate, {
        owner: mockUser,
        name: 'Taken Name',
        id: { $ne: 'tpl-1' },
      })
    })
  })

  describe('getById', () => {
    test('delegates to getTemplateById', async () => {
      const mockTemplate = {
        id: 'tpl-1',
        name: 'My Template',
        isPinned: false,
        orderIndex: 0,
        protocol: 'Oid4vc',
        credentialFormat: 'SdJwtVc',
        network: 'key',
        did: 'did:key:z1',
        schema: {
          id: 'schema-1',
          name: 'Test Schema',
          logo: null,
          bgColor: '#fff',
          fields: { toArray: () => [] },
          registrations: { map: vi.fn().mockReturnValue([]) },
        },
        fields: { map: vi.fn().mockReturnValue([]) },
      }
      vi.mocked(em.findOne).mockResolvedValue(mockTemplate as any)

      const result = await service.getById(authInfo, 'tpl-1')
      expect(em.findOne).toHaveBeenCalledWith(IssuanceTemplate, { owner: mockUser, id: 'tpl-1' }, expect.anything())
      expect(result.id).toBe('tpl-1')
    })
  })

  describe('create - happy path', () => {
    test('creates template and persists it', async () => {
      const mockSchema = {
        id: 'schema-1',
        fields: [{ id: 'f1', name: 'field1' }],
        registrations: { find: vi.fn().mockReturnValue({ id: 'reg-1' }) },
      }
      // First findOne = duplicate name check (null), then schema lookup, then setPlace
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === Schema) return Promise.resolve(mockSchema as any)
        return Promise.resolve(null)
      })

      // setPlace needs em.find
      vi.mocked(em.find).mockResolvedValue([])

      vi.mocked(em.persistAndFlush).mockResolvedValue(undefined as any)

      const createdTemplate = {
        id: 'tpl-new',
        name: 'New Template',
        isPinned: false,
        orderIndex: 0,
        protocol: 'Oid4vc',
        credentialFormat: 'SdJwtVc',
        network: 'key',
        did: 'did:key:z1',
        schema: {
          id: 'schema-1',
          name: 'Test Schema',
          logo: null,
          bgColor: '#fff',
          fields: { toArray: () => [{ id: 'f1', name: 'field1', orderIndex: 0 }] },
          registrations: { map: vi.fn().mockReturnValue([]) },
        },
        fields: { map: vi.fn().mockReturnValue([]) },
      }

      // After persistAndFlush, getTemplateById calls findOne — return the created template
      vi.mocked(em.persistAndFlush).mockImplementation(() => {
        vi.mocked(em.findOne).mockResolvedValue(createdTemplate as any)
        return Promise.resolve()
      })

      const result = await service.create(authInfo, {
        name: 'New Template',
        protocol: 'Oid4vc',
        credentialFormat: 'SdJwtVc',
        schemaId: 'schema-1',
        network: 'key',
        did: 'did:key:z1',
        fields: [],
      } as any)

      expect(result.name).toBe('New Template')
      expect(em.persistAndFlush).toHaveBeenCalled()
    })

    test('creates template without fields property', async () => {
      const mockSchema = {
        id: 'schema-1',
        fields: [{ id: 'f1', name: 'field1' }],
        registrations: { find: vi.fn().mockReturnValue({ id: 'reg-1' }) },
      }
      vi.mocked(em.findOne).mockImplementation((entity: any) => {
        if (entity === Schema) return Promise.resolve(mockSchema as any)
        return Promise.resolve(null)
      })

      vi.mocked(em.find).mockResolvedValue([])

      const createdTemplate = {
        id: 'tpl-new',
        name: 'New',
        isPinned: false,
        orderIndex: 1,
        protocol: 'Oid4vc',
        credentialFormat: 'SdJwtVc',
        network: 'key',
        did: 'did:key:z1',
        schema: {
          id: 'schema-1',
          name: 'S',
          logo: null,
          bgColor: null,
          fields: { toArray: () => [] },
          registrations: { map: vi.fn().mockReturnValue([]) },
        },
        fields: { map: vi.fn().mockReturnValue([]) },
      }

      vi.mocked(em.persistAndFlush).mockImplementation(() => {
        vi.mocked(em.findOne).mockResolvedValue(createdTemplate as any)
        return Promise.resolve()
      })

      const result = await service.create(authInfo, {
        name: 'New',
        protocol: 'Oid4vc',
        credentialFormat: 'SdJwtVc',
        schemaId: 'schema-1',
        network: 'key',
        did: 'did:key:z1',
      } as any)

      expect(result.name).toBe('New')
    })
  })

  describe('patch - happy paths', () => {
    const buildTemplate = (overrides: Partial<any> = {}) => ({
      id: 'tpl-1',
      name: 'Old Name',
      isPinned: false,
      orderIndex: 0,
      protocol: 'Oid4vc',
      credentialFormat: 'SdJwtVc',
      network: 'key',
      did: 'did:key:z1',
      owner: mockUser,
      schema: {
        id: 'schema-1',
        name: 'Schema',
        logo: null,
        bgColor: '#fff',
        fields: [{ id: 'f1', name: 'field1', orderIndex: 0 }],
        registrations: { find: vi.fn().mockReturnValue({ id: 'reg-1' }), map: vi.fn().mockReturnValue([]) },
      },
      fields: { length: 0, removeAll: vi.fn(), add: vi.fn(), map: vi.fn().mockReturnValue([]) },
      ...overrides,
    })

    const setFlushReturnsView = (template: any) => {
      vi.mocked(em.flush).mockImplementation(() => {
        const updatedView = {
          ...template,
          schema: {
            ...template.schema,
            fields: { toArray: () => (Array.isArray(template.schema.fields) ? template.schema.fields : []) },
            registrations: { map: vi.fn().mockReturnValue([]) },
          },
          fields: { map: vi.fn().mockReturnValue([]) },
        }
        vi.mocked(em.findOne).mockResolvedValue(updatedView)
        return Promise.resolve()
      })
    }

    test('updates name successfully', async () => {
      const template = buildTemplate()
      // First findOne = initial template lookup; second = duplicate-name check (null = no conflict)
      vi.mocked(em.findOne)
        .mockResolvedValueOnce(template as any)
        .mockResolvedValueOnce(null)
      setFlushReturnsView(template)

      await service.patch(authInfo, 'tpl-1', { name: 'Updated Name' } as any)

      expect(template.name).toBe('Updated Name')
      expect(em.flush).toHaveBeenCalled()
    })

    test('updates isPinned successfully', async () => {
      const template = buildTemplate()
      vi.mocked(em.findOne).mockResolvedValue(template as any)
      setFlushReturnsView(template)

      await service.patch(authInfo, 'tpl-1', { isPinned: true } as any)

      expect(template.isPinned).toBe(true)
    })

    test('updates protocol, credentialFormat, network, did', async () => {
      const template = buildTemplate()
      vi.mocked(em.findOne).mockResolvedValue(template as any)
      setFlushReturnsView(template)

      await service.patch(authInfo, 'tpl-1', {
        protocol: 'Aries',
        credentialFormat: 'AnonCreds',
        network: 'hedera',
        did: 'did:hedera:abc',
      } as any)

      expect(template.protocol).toBe('Aries')
      expect(template.credentialFormat).toBe('AnonCreds')
      expect(template.network).toBe('hedera')
      expect(template.did).toBe('did:hedera:abc')
    })

    test('updates schema successfully', async () => {
      const template = buildTemplate()
      const newSchema = {
        id: 'schema-2',
        fields: [{ id: 'f2', name: 'field2' }],
        registrations: { find: vi.fn().mockReturnValue({ id: 'reg-2' }), map: vi.fn().mockReturnValue([]) },
      }
      vi.mocked(em.findOne).mockImplementation((entity: any, filter: any) => {
        if (entity === IssuanceTemplate && filter?.id === 'tpl-1') return Promise.resolve(template as any)
        if (entity === Schema && filter?.id === 'schema-2') return Promise.resolve(newSchema as any)
        return Promise.resolve(null)
      })
      setFlushReturnsView(template)

      await service.patch(authInfo, 'tpl-1', { schemaId: 'schema-2' } as any)

      expect(template.schema).toBe(newSchema)
    })

    test('updates schema and validates registration with full protocol/format/network/did', async () => {
      const template = buildTemplate()
      const newSchema = {
        id: 'schema-2',
        fields: [{ id: 'f2', name: 'field2' }],
        registrations: { find: vi.fn().mockReturnValue({ id: 'reg-2' }), map: vi.fn().mockReturnValue([]) },
      }
      vi.mocked(em.findOne).mockImplementation((entity: any, filter: any) => {
        if (entity === IssuanceTemplate && filter?.id === 'tpl-1') return Promise.resolve(template as any)
        if (entity === Schema && filter?.id === 'schema-2') return Promise.resolve(newSchema as any)
        return Promise.resolve(null)
      })
      setFlushReturnsView(template)

      await service.patch(authInfo, 'tpl-1', {
        schemaId: 'schema-2',
        protocol: 'Oid4vc',
        credentialFormat: 'SdJwtVc',
        network: 'key',
        did: 'did:key:z1',
      } as any)

      expect(newSchema.registrations.find).toHaveBeenCalled()
    })

    test('updates fields successfully', async () => {
      const template = buildTemplate()
      vi.mocked(em.findOne).mockResolvedValue(template as any)
      setFlushReturnsView(template)

      await service.patch(authInfo, 'tpl-1', {
        fields: [{ schemaFieldId: 'f1', value: 'val1' }],
      } as any)

      expect(template.fields.add).toHaveBeenCalled()
    })

    test('updates fields and removes existing ones when template has fields', async () => {
      const template = buildTemplate({
        fields: { length: 2, removeAll: vi.fn(), add: vi.fn(), map: vi.fn().mockReturnValue([]) },
      })
      vi.mocked(em.findOne).mockResolvedValue(template as any)
      setFlushReturnsView(template)

      await service.patch(authInfo, 'tpl-1', {
        fields: [{ schemaFieldId: 'f1', value: 'new-val' }],
      } as any)

      expect(template.fields.removeAll).toHaveBeenCalled()
      expect(template.fields.add).toHaveBeenCalled()
    })

    test('handles previousTemplateId = first', async () => {
      const template = buildTemplate()
      vi.mocked(em.findOne).mockResolvedValue(template as any)
      vi.mocked(em.find).mockResolvedValue([])
      setFlushReturnsView(template)

      await service.patch(authInfo, 'tpl-1', { previousTemplateId: null } as any)

      expect(em.flush).toHaveBeenCalled()
    })

    test('handles previousTemplateId with another template id', async () => {
      const template = buildTemplate()
      const prevTemplate = { id: 'prev-tpl', orderIndex: 0 }
      vi.mocked(em.findOne).mockImplementation((entity: any, filter: any) => {
        if (entity === IssuanceTemplate && filter?.id === 'tpl-1') return Promise.resolve(template as any)
        if (entity === IssuanceTemplate && filter?.id === 'prev-tpl') return Promise.resolve(prevTemplate as any)
        return Promise.resolve(null)
      })
      vi.mocked(em.find).mockResolvedValue([prevTemplate as any, template as any])
      setFlushReturnsView(template)

      await service.patch(authInfo, 'tpl-1', { previousTemplateId: 'prev-tpl' } as any)

      expect(em.flush).toHaveBeenCalled()
    })

    test('throws BadRequestException when previousTemplateId not found', async () => {
      const template = buildTemplate()
      vi.mocked(em.findOne).mockImplementation((entity: any, filter: any) => {
        if (entity === IssuanceTemplate && filter?.id === 'tpl-1') return Promise.resolve(template as any)
        return Promise.resolve(null)
      })

      await expect(service.patch(authInfo, 'tpl-1', { previousTemplateId: 'nonexistent' } as any)).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  describe('patch - error paths', () => {
    test('throws BadRequestException when schema not registered for new protocol/format/network/did', async () => {
      const template = {
        id: 'tpl-1',
        name: 'Old',
        owner: mockUser,
        isPinned: false,
        schema: { id: 'old-schema', fields: [], registrations: { find: vi.fn().mockReturnValue(undefined) } },
        fields: { length: 0, removeAll: vi.fn() },
      }
      const newSchema = {
        id: 'schema-2',
        fields: [],
        registrations: { find: vi.fn().mockReturnValue(undefined) },
      }
      vi.mocked(em.findOne).mockImplementation((entity: any, filter: any) => {
        if (entity === IssuanceTemplate && filter?.id === 'tpl-1') return Promise.resolve(template as any)
        if (entity === Schema && filter?.id === 'schema-2') return Promise.resolve(newSchema as any)
        return Promise.resolve(null)
      })

      await expect(
        service.patch(authInfo, 'tpl-1', {
          schemaId: 'schema-2',
          protocol: 'Oid4vc',
          credentialFormat: 'SdJwtVc',
          network: 'key',
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(BadRequestException)
    })

    test('throws BadRequestException when fields contain duplicates', async () => {
      const template = {
        id: 'tpl-1',
        name: 'Old',
        owner: mockUser,
        isPinned: false,
        schema: {
          id: 'schema-1',
          fields: [{ id: 'f1', name: 'field1' }],
          registrations: { find: vi.fn().mockReturnValue({ id: 'reg-1' }) },
        },
        fields: { length: 0, removeAll: vi.fn(), add: vi.fn() },
      }
      vi.mocked(em.findOne).mockResolvedValue(template as any)

      await expect(
        service.patch(authInfo, 'tpl-1', {
          fields: [{ schemaFieldId: 'f1' }, { schemaFieldId: 'f1' }],
        } as any),
      ).rejects.toThrow(BadRequestException)
    })

    test('throws BadRequestException when field id not in schema during patch', async () => {
      const template = {
        id: 'tpl-1',
        name: 'Old',
        owner: mockUser,
        isPinned: false,
        schema: {
          id: 'schema-1',
          fields: [{ id: 'f1', name: 'field1' }],
          registrations: { find: vi.fn().mockReturnValue({ id: 'reg-1' }) },
        },
        fields: { length: 0, removeAll: vi.fn(), add: vi.fn() },
      }
      vi.mocked(em.findOne).mockResolvedValue(template as any)

      await expect(
        service.patch(authInfo, 'tpl-1', {
          fields: [{ schemaFieldId: 'missing-field' }],
        } as any),
      ).rejects.toThrow(BadRequestException)
    })
  })
})
