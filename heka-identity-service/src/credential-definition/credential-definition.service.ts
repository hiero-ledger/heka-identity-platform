import { Injectable } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { AnoncredsRegistryService } from 'common/anoncreds-registry'
import { InjectLogger, Logger } from 'common/logger'

import { CreateCredentialDefinitionDto, CredentialDefinitionDto } from './dto'

@Injectable()
export class CredentialDefinitionService {
  public constructor(
    @InjectLogger(CredentialDefinitionService)
    private readonly logger: Logger,
    private readonly anoncredsRegistryService: AnoncredsRegistryService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public async getCreated(
    tenantAgent: TenantAgent,
    issuerId?: string,
    schemaId?: string,
  ): Promise<CredentialDefinitionDto[]> {
    const logger = this.logger.child('getCreated')
    logger.trace('>')

    const credentialDefinitions = await tenantAgent.modules.anoncreds.getCreatedCredentialDefinitions({
      issuerId,
      schemaId,
    })

    logger.traceObject({ credentialDefinitions })

    const res = credentialDefinitions.map(
      ({ credentialDefinitionId, credentialDefinition }) =>
        new CredentialDefinitionDto({
          id: credentialDefinitionId,
          ...credentialDefinition,
        }),
    )

    logger.trace('<')
    return res
  }

  public async create(tenantAgent: TenantAgent, req: CreateCredentialDefinitionDto): Promise<CredentialDefinitionDto> {
    const logger = this.logger.child('create')
    logger.trace('>')

    await this.anoncredsRegistryService.getSchema(tenantAgent, req.schemaId)

    const registrationResult = await this.anoncredsRegistryService.registerCredentialDefinition(tenantAgent, req)

    logger.trace('<')
    return new CredentialDefinitionDto({
      id: registrationResult.credentialDefinitionId,
      ...registrationResult.credentialDefinition,
    })
  }

  public async get(tenantAgent: TenantAgent, id: string): Promise<CredentialDefinitionDto> {
    const logger = this.logger.child('get')
    logger.trace('>')

    const resolutionResult = await this.anoncredsRegistryService.getCredentialDefinition(tenantAgent, id)

    logger.traceObject({ resolutionResult })

    logger.trace('<')
    return new CredentialDefinitionDto({
      id: resolutionResult.credentialDefinitionId,
      ...resolutionResult.credentialDefinition,
    })
  }
}
