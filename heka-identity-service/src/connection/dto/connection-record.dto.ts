import { DidCommDidExchangeRole, DidCommDidExchangeState } from '@credo-ts/didcomm'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export interface ConnectionDtoOptions {
  id: string
  threadId?: string
  createdAt: Date
  updatedAt?: Date
  state: DidCommDidExchangeState
  errorMessage?: string
  role: DidCommDidExchangeRole
  did?: string
  theirDid?: string
  theirLabel?: string
  alias?: string
  invitationDid?: string
}

export class ConnectionRecordDto {
  public constructor(options: ConnectionDtoOptions) {
    this.id = options.id
    this.threadId = options.threadId
    this.createdAt = options.createdAt
    this.updatedAt = options.updatedAt
    this.state = options.state
    this.errorMessage = options.errorMessage
    this.role = options.role
    this.did = options.did
    this.theirDid = options.theirDid
    this.theirLabel = options.theirLabel
    this.alias = options.alias
    this.invitationDid = options.invitationDid
  }

  @ApiProperty()
  public id: string

  @ApiPropertyOptional()
  public threadId?: string

  @ApiProperty()
  public createdAt: Date

  @ApiPropertyOptional()
  public updatedAt?: Date

  @ApiProperty({ enum: DidCommDidExchangeState })
  public state: DidCommDidExchangeState

  @ApiPropertyOptional()
  public errorMessage?: string

  @ApiProperty({ enum: DidCommDidExchangeRole })
  public role: DidCommDidExchangeRole

  @ApiPropertyOptional()
  public did?: string

  @ApiPropertyOptional()
  public theirDid?: string

  @ApiPropertyOptional()
  public theirLabel?: string

  @ApiPropertyOptional()
  public alias?: string

  @ApiPropertyOptional()
  public invitationDid?: string
}
