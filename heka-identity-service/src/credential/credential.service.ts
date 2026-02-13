import { CredentialState } from '@credo-ts/didcomm'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { TenantAgent } from 'common/agent'
import { AriesCredentialFormat } from 'common/types'
import AgentConfig from 'config/agent'
import { buildAriesCredential, validateAriesCredAttributes } from 'utils/aries'

import { AnoncredsRegistryService } from '../common/anoncreds-registry'
import { InjectLogger, Logger } from '../common/logger'
import { RevocationRegistryService } from '../revocation/revocation-registry/revocation-registry.service'

import { CredentialOfferDto, CredentialRecordDto } from './dto'
import { CredentialConfigDto } from './dto/credential-config.dto'

@Injectable()
export class CredentialService {
  public constructor(
    @Inject(AgentConfig.KEY) private readonly agencyConfig: ConfigType<typeof AgentConfig>,
    @InjectLogger(CredentialService)
    private readonly logger: Logger,
    private readonly anoncredsRegistryService: AnoncredsRegistryService,
    private readonly revocationService: RevocationRegistryService,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public async find(tenantAgent: TenantAgent, threadId?: string): Promise<CredentialRecordDto[]> {
    const credentialRecords = await tenantAgent.modules.credentials.findAllByQuery({ threadId })
    return credentialRecords.map((record) => new CredentialRecordDto(record))
  }

  public async types(): Promise<CredentialConfigDto> {
    return Promise.resolve(new CredentialConfigDto(this.agencyConfig.credentialsConfiguration))
  }

  public async offer(tenantAgent: TenantAgent, req: CredentialOfferDto): Promise<CredentialRecordDto> {
    const connectionRecord = await tenantAgent.modules.connections.findById(req.connectionId)
    if (!connectionRecord) {
      throw new UnprocessableEntityException(`Referenced connection with ID=${req.connectionId} not found`)
    }

    const { credentialDefinition, credentialDefinitionId } =
      await this.anoncredsRegistryService.getCredentialDefinition(tenantAgent, req.credentialDefinitionId)

    let revocationRegistryDefinitionId
    let revocationRegistryIndex

    if (credentialDefinition.value.revocation) {
      const revocationRegistry = await this.revocationService.getOrCreate(
        tenantAgent,
        credentialDefinitionId,
        credentialDefinition.issuerId,
      )

      revocationRegistryDefinitionId = revocationRegistry.revocationRegistryDefinitionId
      revocationRegistryIndex = revocationRegistry.index + 1
    }

    const { schema } = await this.anoncredsRegistryService.getSchema(tenantAgent, credentialDefinition.schemaId)

    const credOfferAttrNames = req.attributes.map((attribute) => attribute.name)

    validateAriesCredAttributes(credOfferAttrNames, schema)

    const credential = buildAriesCredential({
      attributes: req.attributes,
      credentialDefinitionId: req.credentialDefinitionId,
      format: req.format ?? AriesCredentialFormat.AnoncredsIndy,
      issuerId: credentialDefinition.issuerId,
      revocationRegistryDefinitionId,
      revocationRegistryIndex,
    })
    const credentialRecord = await tenantAgent.modules.credentials.offerCredential({
      connectionId: req.connectionId,
      comment: req.comment,
      protocolVersion: 'v2',
      credentialFormats: credential,
    })

    if (revocationRegistryDefinitionId && revocationRegistryIndex) {
      await this.revocationService.update(tenantAgent, revocationRegistryDefinitionId, {
        lastIndex: revocationRegistryIndex,
      })
    }

    return new CredentialRecordDto(credentialRecord)
  }

  public async get(tenantAgent: TenantAgent, id: string): Promise<CredentialRecordDto> {
    const credentialRecord = await tenantAgent.modules.credentials.findById(id)
    if (!credentialRecord) {
      throw new NotFoundException('Credential record not found')
    }
    return new CredentialRecordDto(credentialRecord)
  }

  public async accept(tenantAgent: TenantAgent, id: string): Promise<CredentialRecordDto> {
    let credentialRecord = await tenantAgent.modules.credentials.findById(id)
    if (!credentialRecord) {
      throw new NotFoundException('Credential record not found')
    }
    if (credentialRecord.state === CredentialState.Done) {
      throw new ConflictException('Credential is already accepted')
    }

    credentialRecord = await tenantAgent.modules.credentials.acceptOffer({ credentialRecordId: id })
    return new CredentialRecordDto(credentialRecord)
  }

  public async revoke(tenantAgent: TenantAgent, id: string): Promise<void> {
    const credential = await tenantAgent.modules.credentials.getById(id)

    const revocationRegistryId = credential.getTag('anonCredsRevocationRegistryId') as string
    const revocationIndexStr = credential.getTag('anonCredsCredentialRevocationId') as string

    if (!revocationRegistryId || !revocationIndexStr) {
      throw new BadRequestException(`Credential with id=${id} does not support revocation.`)
    }

    const revocationIndex = Number(revocationIndexStr)
    if (isNaN(revocationIndex)) {
      throw new InternalServerErrorException(`Credential revocationIndex=${id} is not a valid number.`)
    }

    const { revocationStatusList } = await this.revocationService.get(tenantAgent, revocationRegistryId)

    if (revocationStatusList[revocationIndex] === 1) {
      throw new ConflictException(`Credential with id=${id} is already revoked.`)
    }

    const { revocationStatusListState } = await tenantAgent.modules.anoncreds.updateRevocationStatusList({
      revocationStatusList: {
        revocationRegistryDefinitionId: revocationRegistryId,
        revokedCredentialIndexes: [revocationIndex],
      },
      options: {},
    })

    if (revocationStatusListState.state !== 'finished') {
      throw new InternalServerErrorException('Failed to update the revocation status list.')
    }
  }
}
