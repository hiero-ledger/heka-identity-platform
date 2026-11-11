import {
  DidCommCredentialExchangeRecord,
  DidCommCredentialRole,
  DidCommCredentialState,
  DidCommMessageRepository,
} from '@credo-ts/didcomm'
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

import { credentialFormatFromOfferMessage, OFFER_CREDENTIAL_V2_MESSAGE_TAGS } from './credential-format'
import { CredentialOfferDto, CredentialRecordDto, GetCredentialsQueryDto } from './dto'
import { CredentialConfigDto } from './dto/credential-config.dto'
import { isRevocableIssuerRecord } from './dto/credential-record.dto'

/** Credo's `v2AnonCredsRevocationFormat` (not exported from `@credo-ts/didcomm`) */
const ANONCREDS_REVOCATION_NOTIFICATION_FORMAT = 'anoncreds'

/** Exchange ids per offer-message query, to keep the `$or` of the storage query bounded */
const FORMAT_LOOKUP_CHUNK_SIZE = 100

interface RevocationRegistryLookup {
  /** Ledger status list by credential revocation index, undefined when it could not be read */
  revocationStatusList?: number[]
  credentialDefinitionId?: string
}

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

  public async find(tenantAgent: TenantAgent, query: GetCredentialsQueryDto = {}): Promise<CredentialRecordDto[]> {
    const { threadId, role, state } = query
    const filter = Object.fromEntries(
      Object.entries({ threadId, role, state }).filter(([, value]) => value !== undefined),
    )
    const credentialRecords = await tenantAgent.didcomm.credentials.findAllByQuery(filter)

    const [lookups, formats] = await Promise.all([
      this.lookupRevocationRegistries(tenantAgent, credentialRecords),
      this.findCredentialFormats(tenantAgent, credentialRecords),
    ])

    return credentialRecords.map((record) => {
      const format = formats.get(record.id)
      if (!this.hasLedgerStatus(record)) return new CredentialRecordDto(record, { format })

      const lookup = lookups.get(record.getTag('anonCredsRevocationRegistryId') as string)
      const index = Number(record.getTag('anonCredsCredentialRevocationId'))
      const revoked =
        lookup?.revocationStatusList && !isNaN(index) ? lookup.revocationStatusList[index] === 1 : undefined

      return new CredentialRecordDto(record, {
        revoked,
        credentialDefinitionId: lookup?.credentialDefinitionId,
        format,
      })
    })
  }

  /**
   * Credential format of each exchange, read from its stored issue-credential v2 offer message.
   * The exchange record itself does not tell `anoncreds-indy` from `anoncreds-w3c` (both format services
   * write the same tags and AnonCreds metadata), so the offers are loaded in one query per
   * {@link FORMAT_LOOKUP_CHUNK_SIZE} records, not one per record. A failed query leaves the format unknown
   * and never fails the caller.
   */
  private async findCredentialFormats(
    tenantAgent: TenantAgent,
    records: DidCommCredentialExchangeRecord[],
  ): Promise<Map<string, AriesCredentialFormat>> {
    const formats = new Map<string, AriesCredentialFormat>()
    if (records.length === 0) return formats

    const recordIds = records.map((record) => record.id)
    const chunks = Array.from({ length: Math.ceil(recordIds.length / FORMAT_LOOKUP_CHUNK_SIZE) }, (_, i) =>
      recordIds.slice(i * FORMAT_LOOKUP_CHUNK_SIZE, (i + 1) * FORMAT_LOOKUP_CHUNK_SIZE),
    )

    try {
      const messageRepository = tenantAgent.dependencyManager.resolve(DidCommMessageRepository)
      const offerMessages = (
        await Promise.all(
          chunks.map((ids) =>
            messageRepository.findByQuery(tenantAgent.context, {
              ...OFFER_CREDENTIAL_V2_MESSAGE_TAGS,
              $or: ids.map((associatedRecordId) => ({ associatedRecordId })),
            }),
          ),
        )
      ).flat()

      for (const messageRecord of offerMessages) {
        const format = credentialFormatFromOfferMessage(messageRecord)
        if (messageRecord.associatedRecordId && format) formats.set(messageRecord.associatedRecordId, format)
      }
    } catch (error) {
      // Only the error class: the message of a storage error may echo the query or record contents
      this.logger.warn(
        { errorName: error instanceof Error ? error.name : undefined },
        'Could not read the credential offers to determine credential formats',
      )
    }

    return formats
  }

  /** Records whose revocation status is looked up on the ledger in list responses */
  private hasLedgerStatus(record: DidCommCredentialExchangeRecord): boolean {
    return (
      record.role === DidCommCredentialRole.Issuer &&
      record.state === DidCommCredentialState.Done &&
      isRevocableIssuerRecord(record)
    )
  }

  /**
   * Reads the ledger status list and the credential definition id once per revocation registry.
   * A registry that cannot be read leaves its records with an unknown status; it never fails the list.
   */
  private async lookupRevocationRegistries(
    tenantAgent: TenantAgent,
    records: DidCommCredentialExchangeRecord[],
  ): Promise<Map<string, RevocationRegistryLookup>> {
    const registryIds = [
      ...new Set(
        records
          .filter((record) => this.hasLedgerStatus(record))
          .map((record) => record.getTag('anonCredsRevocationRegistryId') as string),
      ),
    ]

    const lookups = await Promise.all(
      registryIds.map(async (revocationRegistryDefinitionId) => {
        const [statusList, credentialDefinitionId] = await Promise.allSettled([
          this.revocationService.get(tenantAgent, revocationRegistryDefinitionId),
          this.revocationService.findCredentialDefinitionId(tenantAgent, revocationRegistryDefinitionId),
        ])

        if (statusList.status === 'rejected') {
          this.logger.warn({ revocationRegistryDefinitionId }, 'Could not read revocation status list')
        }
        if (credentialDefinitionId.status === 'rejected') {
          this.logger.warn(
            { revocationRegistryDefinitionId },
            'Could not find the credential definition of revocation registry',
          )
        }

        const lookup: RevocationRegistryLookup = {
          revocationStatusList: statusList.status === 'fulfilled' ? statusList.value.revocationStatusList : undefined,
          credentialDefinitionId:
            credentialDefinitionId.status === 'fulfilled' ? credentialDefinitionId.value : undefined,
        }
        return [revocationRegistryDefinitionId, lookup] as const
      }),
    )

    return new Map(lookups)
  }

  public async types(): Promise<CredentialConfigDto> {
    return Promise.resolve(new CredentialConfigDto(this.agencyConfig.credentialsConfiguration))
  }

  public async offer(tenantAgent: TenantAgent, req: CredentialOfferDto): Promise<CredentialRecordDto> {
    const connectionRecord = await tenantAgent.didcomm.connections.findById(req.connectionId)
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

    const format = req.format ?? AriesCredentialFormat.AnoncredsIndy
    const credential = buildAriesCredential({
      attributes: req.attributes,
      credentialDefinitionId: req.credentialDefinitionId,
      format,
      issuerId: credentialDefinition.issuerId,
      revocationRegistryDefinitionId,
      revocationRegistryIndex,
    })
    const credentialRecord = await tenantAgent.didcomm.credentials.offerCredential({
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

    return new CredentialRecordDto(credentialRecord, { format })
  }

  public async get(tenantAgent: TenantAgent, id: string): Promise<CredentialRecordDto> {
    const credentialRecord = await tenantAgent.didcomm.credentials.findById(id)
    if (!credentialRecord) {
      throw new NotFoundException('Credential record not found')
    }
    const formats = await this.findCredentialFormats(tenantAgent, [credentialRecord])
    return new CredentialRecordDto(credentialRecord, { format: formats.get(credentialRecord.id) })
  }

  public async accept(tenantAgent: TenantAgent, id: string): Promise<CredentialRecordDto> {
    let credentialRecord = await tenantAgent.didcomm.credentials.findById(id)
    if (!credentialRecord) {
      throw new NotFoundException('Credential record not found')
    }
    if (credentialRecord.state === DidCommCredentialState.Done) {
      throw new ConflictException('Credential is already accepted')
    }

    credentialRecord = await tenantAgent.didcomm.credentials.acceptOffer({ credentialExchangeRecordId: id })
    return new CredentialRecordDto(credentialRecord)
  }

  public async revoke(tenantAgent: TenantAgent, id: string): Promise<void> {
    // findById, not getById: Credo's RecordNotFoundError would surface as a 500
    const credential = await tenantAgent.didcomm.credentials.findById(id)
    if (!credential) {
      throw new NotFoundException('Credential record not found')
    }

    // Holder records carry the same revocation tags, but only the issuer can update the status list
    if (credential.role !== DidCommCredentialRole.Issuer) {
      throw new BadRequestException('Only credentials issued by this wallet can be revoked')
    }

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

    await this.notifyHolderOfRevocation(tenantAgent, credential, revocationRegistryId, revocationIndexStr)
  }

  /**
   * Sends a DIDComm revocation notification v2 to the holder, best effort: the status list is already
   * updated on the ledger, so a failure here is logged and never fails the revoke request.
   * The holder (Credo `DidCommRevocationNotificationService`) parses `credential_id` as
   * `<revocation_registry_id>::<credential_revocation_id>` and matches it against the
   * `anonCredsRevocationRegistryId` / `anonCredsCredentialRevocationId` tags of its record on the same connection.
   */
  private async notifyHolderOfRevocation(
    tenantAgent: TenantAgent,
    credential: DidCommCredentialExchangeRecord,
    revocationRegistryDefinitionId: string,
    credentialRevocationId: string,
  ): Promise<void> {
    // Connectionless exchanges have no channel to the holder
    if (!credential.connectionId) return

    try {
      await tenantAgent.didcomm.credentials.sendRevocationNotification({
        connectionId: credential.connectionId,
        credentialExchangeRecordId: credential.id,
        revocationFormat: ANONCREDS_REVOCATION_NOTIFICATION_FORMAT,
        revocationId: `${revocationRegistryDefinitionId}::${credentialRevocationId}`,
      })
    } catch (error) {
      // Only identifiers and the error class: the message of a Credo error may echo record contents
      this.logger.warn(
        {
          credentialExchangeRecordId: credential.id,
          revocationRegistryDefinitionId,
          errorName: error instanceof Error ? error.name : undefined,
        },
        'Could not send the revocation notification to the holder',
      )
    }
  }
}
