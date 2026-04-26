import { DidCommProofState } from '@credo-ts/didcomm'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export interface ProofRevealedAttributeDtoOptions {
  name: string
  value: string | number | boolean | null
  rawValue?: unknown
}

export class ProofRevealedAttributeDto {
  public constructor(options: ProofRevealedAttributeDtoOptions) {
    this.name = options.name
    this.value = options.value
    this.rawValue = options.rawValue
  }

  @ApiProperty()
  public name: string

  @ApiProperty({
    description: 'The formatted value of the attribute (string, number, boolean, or null)',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'null' },
    ],
  })
  public value: string | number | boolean | null

  @ApiPropertyOptional({
    description: 'The original raw value for complex types (arrays, objects)',
  })
  public rawValue?: unknown
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
