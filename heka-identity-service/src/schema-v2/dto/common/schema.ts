import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger'

import { CredentialRegistrationFormat, DidMethod, ProtocolType } from '../../../common/types'

import { AriesCredentials, Oid4vcCredentials } from './types'

export class SchemaField {
  @ApiProperty({ description: 'Schema field id' })
  public id!: string

  @ApiProperty({ description: 'Schema field name' })
  public name!: string
}

@ApiExtraModels(AriesCredentials, Oid4vcCredentials)
export class SchemaRegistration {
  @ApiProperty({ description: 'Protocol' })
  public protocol!: ProtocolType

  @ApiProperty({ description: 'Credential format' })
  public credentialFormat?: CredentialRegistrationFormat

  @ApiProperty({ description: 'Network' })
  public network?: DidMethod

  @ApiProperty({ description: 'DID' })
  public did!: string

  @ApiProperty({
    description: 'Schema registration details',
    oneOf: [{ $ref: getSchemaPath(AriesCredentials) }, { $ref: getSchemaPath(Oid4vcCredentials) }],
    required: false,
  })
  public credentials?: AriesCredentials | Oid4vcCredentials
}

export class Schema {
  @ApiProperty({ description: 'Schema id' })
  public readonly id!: string

  @ApiProperty({ description: 'Schema Issuer Id' })
  public issuerId?: string

  @ApiProperty({ description: 'Schema Issuer Name' })
  public issuerName?: string

  @ApiProperty({ description: 'Schema name' })
  public readonly name!: string

  @ApiProperty({ description: 'Logo' })
  public readonly logo?: string

  @ApiProperty({ description: 'Background color (HEX RGB)' })
  public bgColor?: string

  @ApiProperty({ description: 'Hidden flag' })
  public isHidden?: boolean

  @ApiProperty({ description: 'Order index' })
  public orderIndex?: number

  @ApiProperty({ description: 'Schema fields', type: SchemaField, isArray: true })
  public fields!: SchemaField[]

  @ApiProperty({ description: 'Registration count' })
  public registrationsCount = 0

  @ApiProperty({ description: 'Registrations', type: SchemaRegistration, isArray: true })
  public registrations!: SchemaRegistration[]

  public constructor(partial?: Partial<Schema>) {
    Object.assign(this, partial)
  }
}
