import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

import { AuthInfo } from 'common/auth'
import { IssuanceTemplate, IssuanceTemplateField, Schema } from 'common/entities'
import { FileStorageService } from 'common/file-storage/file-storage.service'
import { InjectLogger, Logger } from 'common/logger'
import {
  CredentialRegistrationFormat,
  DidMethod,
  ProtocolType,
  credentialFormatToCredentialRegistrationFormat,
} from 'common/types'
import { isDistinctItems, isSubsetInArray, moveElement } from 'utils/array'

import {
  CreateIssuanceTemplateRequest,
  CreateIssuanceTemplateResponse,
  GetIssuanceTemplateResponse,
  GetIssuanceTemplatesListItem,
  GetIssuanceTemplatesListRequest,
  GetIssuanceTemplatesListResponse,
  PatchIssuanceTemplateRequest,
  PatchIssuanceTemplateResponse,
} from './dto'
import { IssuanceTemplate as IssuanceTemplateResponse, IssuanceTemplateSchema } from './dto/common/issuance-template'

@Injectable()
export class IssuanceTemplateService {
  public constructor(
    @InjectLogger(IssuanceTemplateService)
    private readonly logger: Logger,
    private readonly em: EntityManager,
    private readonly fileStorageService: FileStorageService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  private setPlace = async (template: IssuanceTemplate, position?: 'first' | 'last' | string) => {
    // Algorithm
    // 1. Get all list ordered by OrderIndex and Name
    // 2. Element moved in this list to required position (first, last, after another element)
    // 3. For all loaded list items changed order index (by array position)

    const owner = template.owner

    // get prev template
    let prevTemplate: IssuanceTemplate | null = null

    if (position === 'first') {
      // first position
      prevTemplate = null
    } else if (position === 'last') {
      // last position
      prevTemplate = await this.em.findOne(
        IssuanceTemplate,
        { owner, isPinned: template.isPinned },
        { orderBy: [{ orderIndex: 'desc' }] },
      )
    } else {
      // after the scheme position
      prevTemplate = await this.em.findOne(IssuanceTemplate, { owner, id: position })
      if (!prevTemplate) {
        throw new BadRequestException(`Previous issuance template with id ${position} not found.`)
      }
    }

    // get all template
    const templates = await this.em.find(
      IssuanceTemplate,
      { owner, isPinned: template.isPinned },
      { orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }] },
    )

    if (templates.length) {
      // change schema position
      const templateIndex = templates.indexOf(template)
      let toIndex = 0
      if (prevTemplate) {
        const prevTemplateIndex = templates.indexOf(prevTemplate)
        toIndex = prevTemplateIndex <= templateIndex ? prevTemplateIndex + 1 : prevTemplateIndex
      }
      moveElement(templates, templateIndex, toIndex)
      // recalculate order indexes
      templates.forEach((s) => {
        s.orderIndex = templates.indexOf(s)
      })
    }
  }

  private applyFields = (template: IssuanceTemplate, fields: { schemaFieldId: string; value?: string }[]): void => {
    const schema = template.schema
    // remove all if exist
    if (template.fields.length) {
      template.fields.removeAll()
    }
    // add new
    for (const f of fields) {
      const schemaField = schema?.fields?.find((s) => s.id === f.schemaFieldId)
      if (!schemaField) {
        throw new BadRequestException(`Template field ${f.schemaFieldId} not found in the schema`)
      }
      template.fields.add(
        new IssuanceTemplateField({
          schemaField: schemaField,
          value: f.value,
        }),
      )
    }
  }

  private isSchemaRegistered = (
    schema: Schema,
    protocol: ProtocolType,
    credentialFormat: CredentialRegistrationFormat,
    network: DidMethod,
    did: string,
  ) =>
    schema.registrations.find(
      (s) =>
        s.protocol === protocol && s.credentialFormat === credentialFormat && s.network === network && s.did === did,
    )

  private allFieldsInSchema = (schema: Schema, fields: string[]) =>
    isSubsetInArray(fields, schema.fields?.map((f) => f.id) ?? [])

  private checkFields = (fields: string[], schema: Schema) => {
    if (!isDistinctItems(fields)) {
      throw new BadRequestException(`Template field ids must be unique`)
    }
    if (!this.allFieldsInSchema(schema, fields)) {
      throw new BadRequestException(`Some requests fields ids weren't present in the template schema`)
    }
  }

  public getTemplateById = async (authInfo: AuthInfo, id: string): Promise<IssuanceTemplateResponse> => {
    const template = await this.em.findOne(
      IssuanceTemplate,
      { owner: authInfo.user, id },
      {
        populate: ['owner', 'schema', 'schema.fields', 'schema.registrations', 'fields', 'fields.schemaField'],
      },
    )
    if (!template) {
      throw new NotFoundException(`Template with id ${id} not found.`)
    }
    return new IssuanceTemplateResponse({
      id: template.id,
      name: template.name,
      isPinned: template.isPinned,
      orderIndex: template.orderIndex,
      protocol: template.protocol,
      credentialFormat: template.credentialFormat,
      network: template.network,
      did: template.did,
      schema: new IssuanceTemplateSchema({
        id: template.schema.id,
        name: template.schema.name,
        logo: template.schema.logo ? this.fileStorageService.url(template.schema.logo) : undefined,
        bgColor: template.schema.bgColor,
        fields: template.schema.fields
          .toArray()
          .sort((s) => s.orderIndex ?? 0)
          .map((f) => ({
            id: f.id,
            name: f.name,
          })),
        registrations: template.schema.registrations.map((r) => ({
          protocol: r.protocol,
          credentialFormat: r.credentialFormat,
          network: r.network,
          did: r.did,
          credentials: r.credentials,
        })),
      }),
      fields: template.fields
        ? template.fields.map((f) => ({
            id: f.id,
            schemaFieldId: f.schemaField.id,
            schemaFieldName: f.schemaField.name,
            value: f.value,
          }))
        : [],
    })
  }

  public getList = async (
    authInfo: AuthInfo,
    request: GetIssuanceTemplatesListRequest,
  ): Promise<GetIssuanceTemplatesListResponse> => {
    const logger = this.logger.child('getList')
    logger.trace('>')

    const conditions = []

    conditions.push({ owner: authInfo.user })

    if (request.text) {
      conditions.push({ name: { $like: `%${request.text}%` } })
    }

    if (request.isPinned !== undefined) {
      conditions.push({ isPinned: request.isPinned })
    }

    const filter: any = {}
    if (conditions.length > 0) {
      filter.$or = [conditions.length > 1 ? { $and: conditions } : conditions[0]]
    }

    const [items, total] = await this.em.findAndCount(IssuanceTemplate, filter, {
      fields: [
        'id',
        'name',
        'isPinned',
        'orderIndex',
        'owner',
        'schema',
        'fields',
        'protocol',
        'credentialFormat',
        'network',
        'did',
      ],
      offset: request.offset,
      limit: request.limit,
      orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }],
      populate: ['schema', 'schema.fields', 'schema.registrations', 'fields.schemaField'],
    })

    const result = new GetIssuanceTemplatesListResponse({
      total,
      offset: request.offset,
      limit: request.limit,
      items:
        items?.map<GetIssuanceTemplatesListItem>((item) => ({
          id: item.id,
          name: item.name,
          isPinned: item.isPinned,
          orderIndex: item.orderIndex,
          protocol: item.protocol,
          credentialFormat: item.credentialFormat,
          network: item.network,
          did: item.did,
          schema: new IssuanceTemplateSchema({
            id: item.schema.id,
            name: item.schema.name,
            logo: item.schema.logo ? this.fileStorageService.url(item.schema.logo) : undefined,
            bgColor: item.schema.bgColor,
            fields: item.schema.fields
              .toArray()
              .sort((s) => s.orderIndex ?? 0)
              .map((f) => ({
                id: f.id,
                name: f.name,
              })),
            registrations: item.schema.registrations.map((r) => ({
              protocol: r.protocol,
              credentialFormat: r.credentialFormat,
              network: r.network,
              did: r.did,
              credentials: r.credentials,
            })),
          }),
          fields:
            item.fields?.map((f) => ({
              id: f.id,
              schemaFieldId: f.schemaField?.id,
              schemaFieldName: f.schemaField?.name,
              value: f.value,
            })) ?? [],
        })) ?? [],
    })

    logger.trace('<')
    return result
  }

  public getById = async (authInfo: AuthInfo, id: string): Promise<GetIssuanceTemplateResponse> => {
    const logger = this.logger.child('getById')
    logger.trace('>')
    const data = await this.getTemplateById(authInfo, id)
    logger.trace('<')
    return { ...data }
  }

  public create = async (
    authInfo: AuthInfo,
    request: CreateIssuanceTemplateRequest,
  ): Promise<CreateIssuanceTemplateResponse> => {
    const logger = this.logger.child('create')
    logger.trace('>')

    const owner = authInfo.user

    // check unique
    if (await this.em.findOne(IssuanceTemplate, { owner, name: request.name }, { populate: ['owner'] })) {
      throw new BadRequestException(`Template with name ${request.name} already exists.`)
    }

    // check schema exist
    const schema = await this.em.findOne(
      Schema,
      { owner, id: request.schemaId },
      { populate: ['fields', 'registrations'] },
    )
    if (!schema) {
      throw new NotFoundException(`Schema ${request.schemaId} not exists.`)
    }

    // check schema register

    if (
      !this.isSchemaRegistered(
        schema,
        request.protocol,
        credentialFormatToCredentialRegistrationFormat(request.credentialFormat),
        request.network,
        request.did,
      )
    ) {
      throw new BadRequestException(`Schema ${request.schemaId} is not registered.`)
    }

    // check fields
    if (request.fields) {
      this.checkFields(
        request.fields?.map((f) => f.schemaFieldId),
        schema,
      )
    }

    // last template
    const lastTemplate = await this.em.findOne(IssuanceTemplate, { owner }, { orderBy: [{ orderIndex: 'desc' }] })

    // create template
    const newTemplate = new IssuanceTemplate({
      owner,
      name: request.name,
      isPinned: false,
      protocol: request.protocol,
      credentialFormat: request.credentialFormat,
      network: request.network,
      did: request.did,
      orderIndex: (lastTemplate?.orderIndex ?? -1) + 1,
      schema: schema,
    })

    await this.setPlace(newTemplate, 'last')

    if (request.fields) {
      this.applyFields(newTemplate, request.fields)
    }

    await this.em.persistAndFlush(newTemplate)

    const data = await this.getTemplateById(authInfo, newTemplate.id)
    logger.trace('<')
    return { ...data }
  }

  public patch = async (
    authInfo: AuthInfo,
    id: string,
    request: PatchIssuanceTemplateRequest,
  ): Promise<PatchIssuanceTemplateResponse> => {
    const logger = this.logger.child('patch')
    logger.trace('>')

    const owner = authInfo.user

    const template = await this.em.findOne(
      IssuanceTemplate,
      { id, owner },
      { populate: ['owner', 'fields', 'schema', 'schema.fields'] },
    )
    if (!template) {
      throw new NotFoundException(`Template with id ${id} not found.`)
    }

    if (request.name) {
      if (await this.em.findOne(IssuanceTemplate, { owner, name: request.name, id: { $ne: template.id } })) {
        throw new BadRequestException(`Template with name ${request.name} already exists.`)
      }
      template.name = request.name
    }

    if (request.isPinned !== undefined) {
      template.isPinned = request.isPinned
    }

    if (request.previousTemplateId !== undefined) {
      await this.setPlace(template, request.previousTemplateId ? request.previousTemplateId : 'first')
    }

    let schema
    if (request.schemaId) {
      // check schema exist
      schema = await this.em.findOne(Schema, { owner, id: request.schemaId }, { populate: ['fields', 'registrations'] })
      if (!schema) {
        throw new NotFoundException(`Schema ${request.schemaId} not exists.`)
      }

      // check schema register
      if (
        request.protocol &&
        request.credentialFormat &&
        request.network &&
        request.did &&
        !this.isSchemaRegistered(
          schema,
          request.protocol,
          credentialFormatToCredentialRegistrationFormat(request.credentialFormat),
          request.network,
          request.did,
        )
      ) {
        throw new BadRequestException(`Schema ${request.schemaId} is not registered.`)
      }

      template.schema = schema
    }

    if (request.protocol) {
      template.protocol = request.protocol
    }

    if (request.credentialFormat) {
      template.credentialFormat = request.credentialFormat
    }

    if (request.network) {
      template.network = request.network
    }

    if (request.did) {
      template.did = request.did
    }

    if (request.fields) {
      this.checkFields(
        request.fields?.map((f) => f.schemaFieldId),
        schema ?? template.schema,
      )
      this.applyFields(template, request.fields)
    }

    await this.em.flush()

    const data = await this.getTemplateById(authInfo, template.id)
    logger.trace('<')
    return { ...data }
  }

  public delete = async (authInfo: AuthInfo, id: string): Promise<void> => {
    const logger = this.logger.child('delete')
    logger.trace('>')

    const template = await this.em.findOne(
      IssuanceTemplate,
      { id, owner: authInfo.user },
      { populate: ['owner', 'fields'] },
    )
    if (!template) {
      throw new NotFoundException(`Template with id ${id} not found.`)
    }

    template.fields.removeAll()
    this.em.remove(template)

    await this.em.flush()

    logger.trace('<')
  }
}
