import { AnonCredsCredentialMetadata, AnonCredsCredentialMetadataKey } from '@credo-ts/anoncreds'
import { DidCommCredentialExchangeRecord, DidCommCredentialRole, DidCommCredentialState } from '@credo-ts/didcomm'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { AriesCredentialFormat } from 'common/types'

import { CredentialPreviewAttributeDto } from './credential-preview-attribute.dto'

export interface CredentialRecordDtoExtra {
  /** Ledger revocation status. Set only by the list call, for revocable issuer records in state `done`. */
  revoked?: boolean
  /** Fallback when the record has no AnonCreds credential metadata (e.g. the anoncreds-w3c format). */
  credentialDefinitionId?: string
  /** DIDComm credential format, derived from the offer message by the caller */
  format?: AriesCredentialFormat
}

/**
 * Whether this wallet issued the credential with an AnonCreds revocation registry entry.
 * Holder records carry the same tags (set on receipt), so the role is checked as well.
 */
export const isRevocableIssuerRecord = (record: DidCommCredentialExchangeRecord): boolean =>
  record.role === DidCommCredentialRole.Issuer &&
  !!record.getTag('anonCredsRevocationRegistryId') &&
  record.getTag('anonCredsCredentialRevocationId') !== undefined

export class CredentialRecordDto {
  public constructor(record: DidCommCredentialExchangeRecord, extra?: CredentialRecordDtoExtra) {
    this.id = record.id
    this.connectionId = record.connectionId
    this.threadId = record.threadId
    this.createdAt = record.createdAt
    this.updatedAt = record.updatedAt
    this.state = record.state
    this.role = record.role
    this.errorMessage = record.errorMessage
    this.credentialAttributes = record.credentialAttributes?.map(
      (attribute) => new CredentialPreviewAttributeDto(attribute),
    )
    this.revocable = isRevocableIssuerRecord(record)
    this.revoked = extra?.revoked
    this.credentialDefinitionId =
      extra?.credentialDefinitionId ??
      record.metadata.get<AnonCredsCredentialMetadata>(AnonCredsCredentialMetadataKey)?.credentialDefinitionId
    this.format = extra?.format
  }

  @ApiProperty()
  public id: string

  @ApiPropertyOptional()
  public connectionId?: string

  @ApiProperty()
  public threadId: string

  @ApiProperty()
  public createdAt: Date

  @ApiPropertyOptional()
  public updatedAt?: Date

  @ApiProperty({ enum: DidCommCredentialState })
  public state: DidCommCredentialState

  @ApiProperty({ enum: DidCommCredentialRole, description: 'Role of this wallet in the credential exchange' })
  public role: DidCommCredentialRole

  @ApiPropertyOptional()
  public errorMessage?: string

  @ApiPropertyOptional({ type: [CredentialPreviewAttributeDto] })
  public credentialAttributes?: CredentialPreviewAttributeDto[]

  @ApiProperty({
    description:
      'True when this wallet issued the credential with an AnonCreds revocation registry entry, so it can be revoked',
  })
  public revocable: boolean

  @ApiPropertyOptional({
    description:
      'Present only in list responses, for revocable issuer records in state `done`, when the ledger status list could be read',
  })
  public revoked?: boolean

  @ApiPropertyOptional({ description: 'AnonCreds credential definition id, when known' })
  public credentialDefinitionId?: string

  @ApiPropertyOptional({
    enum: AriesCredentialFormat,
    description:
      'DIDComm credential format, taken from the stored credential offer. Absent when it cannot be determined',
  })
  public format?: AriesCredentialFormat
}
