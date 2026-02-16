import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { CredentialFormat, DidMethod, ProtocolType } from '../../../common/types'
import { SchemaField, SchemaRegistration } from '../../../schema-v2/dto/common/schema'

export class IssuanceTemplateSchema {
  @ApiProperty({ description: 'Schema id' })
  public readonly id!: string

  @ApiProperty({ description: 'Schema name' })
  public readonly name!: string

  @ApiProperty({ description: 'Logo' })
  public readonly logo?: string

  @ApiProperty({ description: 'Background color (HEX RGB)' })
  public bgColor?: string

  @ApiProperty({ description: 'Schema fields', type: SchemaField, isArray: true })
  public fields!: SchemaField[]

  @ApiProperty({ description: 'Registrations', type: SchemaRegistration, isArray: true })
  public registrations!: SchemaRegistration[]

  public constructor(partial?: Partial<IssuanceTemplateSchema>) {
    Object.assign(this, partial)
  }
}

export class IssuanceTemplateField {
  @ApiProperty({ description: 'Issuance template field id', required: false })
  public id!: string

  @ApiProperty({ description: 'Schema field id' })
  public schemaFieldId!: string

  @ApiProperty({ description: 'Schema field name' })
  public schemaFieldName!: string

  @ApiPropertyOptional({ description: 'Value' })
  public value?: string
}

export class IssuanceTemplate {
  @ApiProperty({ description: 'Template id' })
  public readonly id!: string

  @ApiProperty({ description: 'Order index' })
  public orderIndex?: number

  @ApiProperty({ description: 'Pinned flag' })
  public isPinned?: boolean

  @ApiProperty({ description: 'Template name' })
  public readonly name!: string

  @ApiProperty({ description: 'Protocol' })
  public protocol!: ProtocolType

  @ApiProperty({ description: 'Credential format' })
  public credentialFormat!: CredentialFormat

  @ApiProperty({ description: 'Network' })
  public network!: DidMethod

  @ApiProperty({ description: 'DID' })
  public did!: string

  @ApiProperty({ description: 'Schema' })
  public schema!: IssuanceTemplateSchema

  @ApiProperty({ description: 'Credential values', type: IssuanceTemplateField, isArray: true })
  public fields!: IssuanceTemplateField[]

  public constructor(partial?: Partial<IssuanceTemplate>) {
    Object.assign(this, partial)
  }
}
