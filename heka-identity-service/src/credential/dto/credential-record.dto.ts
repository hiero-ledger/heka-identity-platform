import { DidCommCredentialState } from '@credo-ts/didcomm'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { CredentialPreviewAttributeDto, CredentialPreviewAttributeDtoOptions } from './credential-preview-attribute.dto'

export interface CredentialRecordDtoOptions {
  id: string
  connectionId?: string
  threadId: string
  createdAt: Date
  updatedAt?: Date
  state: DidCommCredentialState
  errorMessage?: string
  credentialAttributes?: CredentialPreviewAttributeDtoOptions[]
}

export class CredentialRecordDto {
  public constructor(options: CredentialRecordDtoOptions) {
    this.id = options.id
    this.connectionId = options.connectionId
    this.threadId = options.threadId
    this.createdAt = options.createdAt
    this.updatedAt = options.updatedAt
    this.state = options.state
    this.errorMessage = options.errorMessage
    this.credentialAttributes = options.credentialAttributes?.map(
      (attribute) => new CredentialPreviewAttributeDto(attribute),
    )
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

  @ApiPropertyOptional()
  public errorMessage?: string

  @ApiPropertyOptional({ type: [CredentialPreviewAttributeDto] })
  public credentialAttributes?: CredentialPreviewAttributeDto[]
}
