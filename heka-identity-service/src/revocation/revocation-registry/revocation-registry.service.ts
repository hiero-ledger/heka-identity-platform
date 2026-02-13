import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

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

    await tenantAgent.modules.anoncreds.registerRevocationStatusList({
      revocationStatusList: {
        revocationRegistryDefinitionId: registrationResult.revocationRegistryDefinitionId,
        issuerId: req.issuerId,
      },
      options: {},
    })

    const revocationRegistryDefinitionId = registrationResult.revocationRegistryDefinitionId

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
    return revocationRegistry ?? (await this.create(tenantAgent, { credentialDefinitionId, issuerId }))
  }
}
