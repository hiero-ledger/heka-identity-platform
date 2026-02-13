import { BadRequestException, Injectable } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { AnoncredsRegistryService } from 'common/anoncreds-registry'
import { InjectLogger, Logger } from 'common/logger'

import { CreateSchemaDto, FindSchemasDto, SchemaDto } from './dto'

@Injectable()
export class SchemaService {
  public constructor(
    @InjectLogger(SchemaService)
    private readonly logger: Logger,
    private readonly anoncredsRegistryService: AnoncredsRegistryService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public async getCreated(tenantAgent: TenantAgent, query: FindSchemasDto): Promise<SchemaDto[]> {
    const logger = this.logger.child('getCreated')
    logger.trace('>')

    const schemas = await tenantAgent.modules.anoncreds.getCreatedSchemas({
      methodName: query.method,
    })

    logger.traceObject({ schemas })

    const res = schemas.map(({ schemaId, schema }) => new SchemaDto({ id: schemaId, ...schema }))

    logger.trace('<')
    return res
  }

  public async get(tenantAgent: TenantAgent, id: string): Promise<SchemaDto> {
    const logger = this.logger.child('get')
    logger.trace('>')

    const schemaResult = await this.anoncredsRegistryService.getSchema(tenantAgent, id)
    logger.traceObject({ schemaResult })

    const schemaRes = new SchemaDto({
      id: schemaResult.schemaId,
      ...schemaResult.schema,
    })

    logger.trace('<')
    return schemaRes
  }

  public async create(tenantAgent: TenantAgent, req: CreateSchemaDto): Promise<SchemaDto> {
    const logger = this.logger.child('create')
    logger.trace('>')

    if (!req.attrNames) {
      throw new BadRequestException('Unsupported schema format')
    }

    const schemaResult = await this.anoncredsRegistryService.registerSchema(tenantAgent, {
      attrNames: req.attrNames,
      ...req,
    })

    const res = new SchemaDto({
      id: schemaResult.schemaId,
      ...schemaResult.schema,
    })

    logger.trace('<')
    return res
  }
}
