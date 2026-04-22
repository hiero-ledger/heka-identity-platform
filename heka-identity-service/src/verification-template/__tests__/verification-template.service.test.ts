import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, NotFoundException } from '@nestjs/common'

import { Role } from 'common/auth'
import { Schema, VerificationTemplate } from 'common/entities'
import { FileStorageService } from 'common/file-storage/file-storage.service'
import { Logger } from 'common/logger'

import { VerificationTemplateService } from '../verification-template.service'

describe('VerificationTemplateService', () => {
  let service: VerificationTemplateService
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
    service = new VerificationTemplateService(logger, em, fileStorageService)
  })

  describe('getTemplateById', () => {
    test('returns template with populated schema and fields', async () => {
      const mockTemplate = {
        id: 'tpl-1',
        name: 'Verify Template',
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
          registrations: { map: vi.fn().mockReturnValue([{ protocol: 'Oid4vc' }]) },
        },
        fields: {
          map: vi.fn().mockReturnValue([{ id: 'tf1', schemaFieldId: 'f1', schemaFieldName: 'field1' }]),
        },
      }
      vi.mocked(em.findOne).mockResolvedValue(mockTemplate as any)
      vi.mocked(fileStorageService.url).mockReturnValue('https://cdn/logo.png')

      const result = await service.getTemplateById(authInfo, 'tpl-1')

      expect(em.findOne).toHaveBeenCalledWith(VerificationTemplate, { owner: mockUser, id: 'tpl-1' }, expect.anything())
      expect(fileStorageService.url).toHaveBeenCalledWith('path/logo.png')
      expect(result.id).toBe('tpl-1')
      expect(result.name).toBe('Verify Template')
      expect(result.schema.logo).toBe('https://cdn/logo.png')
    })

    test('throws NotFoundException when template not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null)

      await expect(service.getTemplateById(authInfo, 'missing')).rejects.toThrow(NotFoundException)
      expect(em.findOne).toHaveBeenCalledWith(
        VerificationTemplate,
        { owner: mockUser, id: 'missing' },
        expect.anything(),
      )
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

      expect(em.findAndCount).toHaveBeenCalledWith(VerificationTemplate, expect.anything(), expect.anything())
      expect(result.total).toBe(1)
      expect(result.items).toHaveLength(1)
    })
  })

  describe('create', () => {
    test('throws BadRequestException when network missing for Aries protocol', async () => {
      await expect(
        service.create(authInfo, {
          name: 'Test',
          protocol: 'Aries',
          schemaId: 'schema-1',
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(BadRequestException)
    })

    test('throws BadRequestException when template name already exists', async () => {
      vi.mocked(em.findOne).mockResolvedValue({ id: 'existing' } as any)

      await expect(
        service.create(authInfo, {
          name: 'Duplicate',
          protocol: 'Oid4vc',
          schemaId: 'schema-1',
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(BadRequestException)
      expect(em.findOne).toHaveBeenCalledWith(
        VerificationTemplate,
        { owner: mockUser, name: 'Duplicate' },
        expect.anything(),
      )
    })

    test('throws NotFoundException when schema not found', async () => {
      // findOne returns null for both template name check and schema lookup
      vi.mocked(em.findOne).mockResolvedValue(null as any)

      await expect(
        service.create(authInfo, {
          name: 'New',
          protocol: 'Oid4vc',
          schemaId: 'bad-schema',
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(NotFoundException)
    })

    test('creates template and persists it', async () => {
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
      const mockSchema = {
        id: 'schema-1',
        fields: [{ id: 'f1', name: 'field1' }],
      }

      // Multiple findOne calls with different entities/args during create():
      //   VerificationTemplate for name uniqueness -> null
      //   Schema -> mockSchema
      //   VerificationTemplate for lastTemplate (in setPlace) -> null
      //   VerificationTemplate for getTemplateById after persist -> createdTemplate
      // Use implementation keyed on entity + args; fall back to null.
      let persisted = false
      vi.mocked(em.findOne).mockImplementation(((entity: any, where: any) => {
        if (entity === Schema) return Promise.resolve(mockSchema as any)
        if (entity === VerificationTemplate) {
          if (persisted && where?.id === 'tpl-new') return Promise.resolve(createdTemplate as any)
          return Promise.resolve(null)
        }
        return Promise.resolve(null)
      }) as any)

      vi.mocked(em.find).mockResolvedValue([])

      vi.mocked(em.persistAndFlush).mockImplementation((entity: any) => {
        persisted = true
        // Simulate ORM assigning id to the new entity
        entity.id = 'tpl-new'
        return Promise.resolve()
      })

      const result = await service.create(authInfo, {
        name: 'New Template',
        protocol: 'Oid4vc',
        credentialFormat: 'SdJwtVc',
        schemaId: 'schema-1',
        did: 'did:key:z1',
        fields: [],
      } as any)

      expect(result.name).toBe('New Template')
      expect(em.persistAndFlush).toHaveBeenCalled()
    })

    test('throws BadRequestException when field IDs are not unique', async () => {
      // Schema lookup returns an empty-fields schema so checkFields throws BadRequestException
      // (fields in request aren't a subset of schema.fields).
      const mockSchema = {
        id: 'schema-1',
        fields: [],
      }

      vi.mocked(em.findOne).mockImplementation(((entity: any) => {
        if (entity === Schema) return Promise.resolve(mockSchema as any)
        return Promise.resolve(null)
      }) as any)

      await expect(
        service.create(authInfo, {
          name: 'New',
          protocol: 'Oid4vc',
          schemaId: 'schema-1',
          did: 'did:key:z1',
          fields: [{ schemaFieldId: 'f1' }, { schemaFieldId: 'f1' }],
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

      expect(em.findOne).toHaveBeenCalledWith(VerificationTemplate, { owner: mockUser, id: 'tpl-1' }, expect.anything())
      expect(mockTemplate.fields.removeAll).toHaveBeenCalled()
      expect(em.remove).toHaveBeenCalledWith(mockTemplate)
      expect(em.flush).toHaveBeenCalled()
    })

    test('throws NotFoundException when template not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null)

      await expect(service.delete(authInfo, 'missing')).rejects.toThrow(NotFoundException)
      expect(em.findOne).toHaveBeenCalledWith(
        VerificationTemplate,
        { owner: mockUser, id: 'missing' },
        expect.anything(),
      )
    })
  })

  describe('patch', () => {
    test('throws NotFoundException when template not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null)

      await expect(service.patch(authInfo, 'missing', {} as any)).rejects.toThrow(NotFoundException)
      expect(em.findOne).toHaveBeenCalledWith(
        VerificationTemplate,
        { owner: mockUser, id: 'missing' },
        expect.anything(),
      )
    })

    test('patches template name successfully', async () => {
      const mockTemplate = {
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
          name: 'Test Schema',
          logo: null,
          bgColor: '#fff',
          fields: [{ id: 'f1', name: 'field1', orderIndex: 0 }],
          registrations: { map: vi.fn().mockReturnValue([]) },
        },
        fields: { length: 0, removeAll: vi.fn(), map: vi.fn().mockReturnValue([]) },
      }

      let flushed = false
      vi.mocked(em.findOne).mockImplementation(((entity: any, where: any) => {
        if (entity !== VerificationTemplate) return Promise.resolve(null)
        // After flush, getTemplateById fetches with populate again — return updated template
        if (flushed && where?.id === 'tpl-1') {
          return Promise.resolve({
            ...mockTemplate,
            name: 'Updated Name',
            schema: {
              ...mockTemplate.schema,
              fields: { toArray: () => [{ id: 'f1', name: 'field1', orderIndex: 0 }] },
            },
          } as any)
        }
        // Primary lookup by id
        if (where?.id === 'tpl-1') return Promise.resolve(mockTemplate as any)
        // Duplicate name check returns null
        return Promise.resolve(null)
      }) as any)

      vi.mocked(em.flush).mockImplementation(() => {
        flushed = true
        return Promise.resolve()
      })

      await service.patch(authInfo, 'tpl-1', { name: 'Updated Name' } as any)

      expect(mockTemplate.name).toBe('Updated Name')
      expect(em.flush).toHaveBeenCalled()
    })

    test('throws BadRequestException when new name already exists', async () => {
      const mockTemplate = {
        id: 'tpl-1',
        name: 'Old',
        owner: mockUser,
        schema: { id: 'schema-1', fields: [] },
        fields: { length: 0, removeAll: vi.fn() },
      }

      vi.mocked(em.findOne).mockImplementation(((entity: any, where: any) => {
        if (entity !== VerificationTemplate) return Promise.resolve(null)
        if (where?.id === 'tpl-1') return Promise.resolve(mockTemplate as any)
        if (where?.name === 'Taken') return Promise.resolve({ id: 'other' } as any)
        return Promise.resolve(null)
      }) as any)

      await expect(service.patch(authInfo, 'tpl-1', { name: 'Taken' } as any)).rejects.toThrow(BadRequestException)
    })
  })
})
