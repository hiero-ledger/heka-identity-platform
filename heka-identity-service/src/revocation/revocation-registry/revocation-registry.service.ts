import {
  AnonCredsRevocationRegistryDefinitionRecordMetadataKeys,
  AnonCredsRevocationRegistryDefinitionRepository,
  isDidIndyRevocationRegistryId,
  isUnqualifiedRevocationRegistryId,
} from '@credo-ts/anoncreds'
import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'

import { TenantAgent } from '../../common/agent'
import { AnoncredsRegistryService } from '../../common/anoncreds-registry'
import { uuid } from '../../utils/misc'

import {
  CreateRevocationRegistryRequest,
  CreateRevocationRegistryResponse,
  GetRevocationRegistryResponse,
  RevocationRegistry,
} from './dto'
import { defaultMaximumCredentialNumber } from './dto/create-revocation-registry.dto'

@Injectable()
export class RevocationRegistryService {
  public constructor(private readonly anoncredsRegistryService: AnoncredsRegistryService) {}

  public async create(
    tenantAgent: TenantAgent,
    req: CreateRevocationRegistryRequest,
  ): Promise<CreateRevocationRegistryResponse> {
    const maximumCredentialNumber = req.maximumCredentialNumber ?? defaultMaximumCredentialNumber

    const dids = await tenantAgent.dids.getCreatedDids({ did: req.issuerId })
    if (dids.length === 0) {
      throw new NotFoundException(`Failed to find did: ${req.issuerId} for current agent`)
    }

    const registrationResult = await this.anoncredsRegistryService.registerRevocationRegistryDefinition(
      tenantAgent,
      req.issuerId,
      req.credentialDefinitionId,
      maximumCredentialNumber,
    )

    const { revocationStatusListState } = await tenantAgent.modules.anoncreds.registerRevocationStatusList({
      revocationStatusList: {
        revocationRegistryDefinitionId: registrationResult.revocationRegistryDefinitionId,
        issuerId: req.issuerId,
      },
      options: {},
    })
    // Without its initial status list the registry cannot issue; do not save it as usable
    if (revocationStatusListState.state !== 'finished') {
      throw new InternalServerErrorException(
        `Revocation status list registration failed: ${
          revocationStatusListState.state === 'failed' ? revocationStatusListState.reason : 'Not finished'
        }`,
      )
    }

    const revocationRegistryDefinitionId = registrationResult.revocationRegistryDefinitionId
    await this.ensureIndyIssuanceTypeMetadata(tenantAgent, revocationRegistryDefinitionId)

    await tenantAgent.genericRecords.save({
      id: uuid(),
      tags: {
        revocationRegistryDefinitionId,
        credentialDefinitionId: req.credentialDefinitionId,
      },
      content: {
        revocationRegistryDefinitionId,
        credentialDefinitionId: req.credentialDefinitionId,
        index: 0,
        maximumCredentialNumber,
      },
    })

    return new RevocationRegistry({
      revocationRegistryDefinitionId,
      index: 0,
      maximumCredentialNumber,
    })
  }

  public async get(tenantAgent: TenantAgent, id: string, timestamp_?: string): Promise<GetRevocationRegistryResponse> {
    const timestamp = timestamp_ ? Number(timestamp_) : Math.floor(Date.now() / 1000)
    if (isNaN(timestamp)) {
      throw new BadRequestException(`Timestamp must be a valid number. Received: ${timestamp_}`)
    }

    const { revocationStatusList } = await tenantAgent.modules.anoncreds.getRevocationStatusList(id, timestamp)

    if (!revocationStatusList) {
      throw new NotFoundException(
        `Could not find the revocation status list for revocation registry id: ${id} and timestamp: ${timestamp}.`,
      )
    }

    return {
      timestamp,
      revocationStatusList: revocationStatusList.revocationList,
    }
  }

  public async find(tenantAgent: TenantAgent, credentialDefinitionId?: string): Promise<Array<RevocationRegistry>> {
    const revocRecords = await tenantAgent.genericRecords.findAllByQuery({
      credentialDefinitionId,
    })

    return revocRecords.map(
      (record) =>
        new RevocationRegistry({
          revocationRegistryDefinitionId: record.content.revocationRegistryDefinitionId as string,
          index: Number(record.content.index),
          maximumCredentialNumber: Number(record.content.maximumCredentialNumber),
        }),
    )
  }

  public async update(tenantAgent: TenantAgent, revocationRegistryDefinitionId: string, data: { lastIndex: number }) {
    const records = await tenantAgent.genericRecords.findAllByQuery({
      revocationRegistryDefinitionId,
    })
    if (!records.length) {
      throw new BadRequestException(`Revocation registry with id=${revocationRegistryDefinitionId} not found!`)
    }

    const record = records[0]
    record.content.index = data.lastIndex
    await tenantAgent.genericRecords.update(record)
  }

  public async getOrCreate(
    tenantAgent: TenantAgent,
    credentialDefinitionId: string,
    issuerId: string,
  ): Promise<RevocationRegistry> {
    const revocationRegistries = await this.find(tenantAgent, credentialDefinitionId)
    const revocationRegistry = revocationRegistries.find(
      (registry) => registry.index < registry.maximumCredentialNumber,
    )
    if (!revocationRegistry) return await this.create(tenantAgent, { credentialDefinitionId, issuerId })

    // Registries created before the metadata workaround below are repaired before they are used
    await this.ensureIndyIssuanceTypeMetadata(tenantAgent, revocationRegistry.revocationRegistryDefinitionId)
    return revocationRegistry
  }

  /**
   * Workaround for Credo 0.7 (`@credo-ts/indy-vdr`): its registrar stores the revocation registry definition
   * record with empty metadata, but `getRevocationStatusList` serves the issuer from that record and requires
   * `issuanceType`. Without it every issue from the registry fails with "Could not retrieve revocation status
   * list". The registrar always writes ISSUANCE_BY_DEFAULT to the ledger, so the record gets the same value.
   * TODO: Remove this after upgrade to Credo 0.7.4
   */
  private async ensureIndyIssuanceTypeMetadata(tenantAgent: TenantAgent, revocationRegistryDefinitionId: string) {
    if (
      !isDidIndyRevocationRegistryId(revocationRegistryDefinitionId) &&
      !isUnqualifiedRevocationRegistryId(revocationRegistryDefinitionId)
    ) {
      return
    }

    const repository = tenantAgent.dependencyManager.resolve(AnonCredsRevocationRegistryDefinitionRepository)
    const record = await repository.findSingleByQuery(tenantAgent.context, { revocationRegistryDefinitionId })
    if (!record) return

    const metadataKey = AnonCredsRevocationRegistryDefinitionRecordMetadataKeys.RevocationRegistryDefinitionMetadata
    const metadata = record.metadata.get(metadataKey) ?? {}
    if (metadata.issuanceType) return

    record.metadata.set(metadataKey, { ...metadata, issuanceType: 'ISSUANCE_BY_DEFAULT' })
    await repository.update(tenantAgent.context, record)
  }
}
