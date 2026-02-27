import { DidCommProofState } from '@credo-ts/didcomm'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export interface ProofRevealedAttributeDtoOptions {
  name: string
  value: string
}

export class ProofRevealedAttributeDto {
  public constructor(options: ProofRevealedAttributeDtoOptions) {
    this.name = options.name
    this.value = options.value
  }

  @ApiProperty()
  public name: string

  @ApiProperty()
  public value: string
}

export interface ProofRecordDtoOptions {
  id: string
  connectionId?: string
  threadId: string
  createdAt: Date
  updatedAt?: Date
  state: DidCommProofState
  isVerified?: boolean
  revealedAttributes?: Array<ProofRevealedAttributeDtoOptions>
}

export class ProofRecordDto {
  public constructor(options: ProofRecordDtoOptions) {
    this.id = options.id
    this.connectionId = options.connectionId
    this.threadId = options.threadId
    this.createdAt = options.createdAt
    this.updatedAt = options.updatedAt
    this.state = options.state
    this.isVerified = options.isVerified
    this.revealedAttributes = options.revealedAttributes?.map((attribute) => new ProofRevealedAttributeDto(attribute))
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

  @ApiProperty({ enum: DidCommProofState })
  public state: DidCommProofState

  @ApiPropertyOptional()
  public isVerified?: boolean

  @ApiPropertyOptional({ type: [ProofRevealedAttributeDto] })
  public revealedAttributes?: Array<ProofRevealedAttributeDto>
}
