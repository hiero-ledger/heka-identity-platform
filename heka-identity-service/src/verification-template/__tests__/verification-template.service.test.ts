import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { when } from 'vitest-when'

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
      when(em.findOne)
        .calledWith(VerificationTemplate, { owner: mockUser, id: 'tpl-1' }, expect.anything())
        .thenResolve(mockTemplate as any)
      when(fileStorageService.url).calledWith('path/logo.png').thenReturn('https://cdn/logo.png')

      const result = await service.getTemplateById(authInfo, 'tpl-1')

      expect(result.id).toBe('tpl-1')
      expect(result.name).toBe('Verify Template')
      expect(result.schema.logo).toBe('https://cdn/logo.png')
    })

    test('throws NotFoundException when template not found', async () => {
      when(em.findOne)
        .calledWith(VerificationTemplate, { owner: mockUser, id: 'missing' }, expect.anything())
        .thenResolve(null)

      await expect(service.getTemplateById(authInfo, 'missing')).rejects.toThrow(NotFoundException)
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
      when(em.findAndCount)
        .calledWith(VerificationTemplate, expect.anything(), expect.anything())
        .thenResolve([mockItems as any, 1])

      const result = await service.getList(authInfo, { offset: 0, limit: 10 })

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
      when(em.findOne)
        .calledWith(VerificationTemplate, { owner: mockUser, name: { $eq: 'Duplicate' } })
        .thenResolve({ id: 'existing' } as any)

      await expect(
        service.create(authInfo, {
          name: 'Duplicate',
          protocol: 'Oid4vc',
          schemaId: 'schema-1',
          did: 'did:key:z1',
        } as any),
      ).rejects.toThrow(BadRequestException)
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
      // Duplicate name check returns null
      vi.mocked(em.findOne).mockResolvedValue(null as any)

      // Schema exists — override for Schema entity call
      const mockSchema = {
        id: 'schema-1',
        fields: [{ id: 'f1', name: 'field1' }],
      }
      when(em.findOne)
        .calledWith(Schema, expect.anything(), expect.anything())
        .thenResolve(mockSchema as any)

      // setPlace needs em.find
      when(em.find).calledWith(VerificationTemplate, expect.anything(), expect.anything()).thenResolve([])

      when(em.persistAndFlush)
        .calledWith(expect.anything())
        .thenResolve(undefined as any)

      // getTemplateById at the end of create — match any findOne for VerificationTemplate with populate
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
        did: 'did:key:z1',
        fields: [],
      } as any)

      expect(result.name).toBe('New Template')
      expect(em.persistAndFlush).toHaveBeenCalled()
    })

    test('throws BadRequestException when field IDs are not unique', async () => {
      when(em.findOne)
        .calledWith(VerificationTemplate, { owner: mockUser, name: { $eq: 'New' } })
        .thenResolve(null)

      const mockSchema = {
        id: 'schema-1',
        fields: [{ id: 'f1', name: 'field1' }],
      }
      when(em.findOne)
        .calledWith(Schema, { owner: mockUser, id: 'schema-1' })
        .thenResolve(mockSchema as any)

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
      when(em.findOne)
        .calledWith(VerificationTemplate, { id: 'tpl-1', owner: mockUser }, expect.anything())
        .thenResolve(mockTemplate as any)

      await service.delete(authInfo, 'tpl-1')

      expect(mockTemplate.fields.removeAll).toHaveBeenCalled()
      expect(em.remove).toHaveBeenCalledWith(mockTemplate)
      expect(em.flush).toHaveBeenCalled()
    })

    test('throws NotFoundException when template not found', async () => {
      when(em.findOne)
        .calledWith(VerificationTemplate, { id: 'missing', owner: mockUser }, expect.anything())
        .thenResolve(null)

      await expect(service.delete(authInfo, 'missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('patch', () => {
    test('throws NotFoundException when template not found', async () => {
      when(em.findOne)
        .calledWith(VerificationTemplate, { owner: mockUser, id: 'missing' }, expect.anything())
        .thenResolve(null)

      await expect(service.patch(authInfo, 'missing', {} as any)).rejects.toThrow(NotFoundException)
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

      // Default: all findOne calls return null (duplicate name check)
      vi.mocked(em.findOne).mockResolvedValue(null as any)

      // findOne for template lookup (with populate) returns the template
      when(em.findOne)
        .calledWith(VerificationTemplate, { owner: mockUser, id: 'tpl-1' }, expect.anything())
        .thenResolve(mockTemplate as any)

      // After flush, getTemplateById calls findOne — return updated view
      vi.mocked(em.flush).mockImplementation(() => {
        const updatedTemplate = {
          ...mockTemplate,
          name: 'Updated Name',
          schema: {
            ...mockTemplate.schema,
            fields: { toArray: () => [{ id: 'f1', name: 'field1', orderIndex: 0 }] },
          },
        }
        when(em.findOne)
          .calledWith(VerificationTemplate, { owner: mockUser, id: 'tpl-1' }, expect.anything())
          .thenResolve(updatedTemplate as any)
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
      when(em.findOne)
        .calledWith(VerificationTemplate, { owner: mockUser, id: 'tpl-1' }, expect.anything())
        .thenResolve(mockTemplate as any)
      when(em.findOne)
        .calledWith(VerificationTemplate, { owner: mockUser, name: 'Taken' })
        .thenResolve({ id: 'other' } as any)

      await expect(service.patch(authInfo, 'tpl-1', { name: 'Taken' } as any)).rejects.toThrow(BadRequestException)
    })
  })
})
