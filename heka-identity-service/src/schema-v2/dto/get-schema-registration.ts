import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger'
import { IsEnum, IsString, MaxLength } from 'class-validator'

import {
  AriesCredentialRegistrationFormat,
  CredentialRegistrationFormat,
  protocolCredentialRegistrationFormats,
  DidMethod,
  didMethods,
  OpenId4VCCredentialRegistrationFormat,
  ProtocolType,
} from '../../common/types'
import { IsCorrectForProtocol } from '../../utils/validation'

import { AriesCredentials, Oid4vcCredentials } from './common/types'

export class GetSchemaRegistrationRequest {
  @ApiProperty({ description: 'Protocol', enum: ProtocolType })
  @IsEnum(ProtocolType)
  public protocol!: ProtocolType

  @ApiProperty({
    description: 'Credential format',
    enum: { ...AriesCredentialRegistrationFormat, ...OpenId4VCCredentialRegistrationFormat },
  })
  @IsEnum({ ...AriesCredentialRegistrationFormat, ...OpenId4VCCredentialRegistrationFormat })
  @IsCorrectForProtocol('protocol', protocolCredentialRegistrationFormats, {
    message: 'CredentialFormat is not compatible with the protocol',
  })
  public credentialFormat?: CredentialRegistrationFormat

  @ApiProperty({ description: 'Network', enum: DidMethod })
  @IsEnum(DidMethod)
  @IsCorrectForProtocol('protocol', didMethods, { message: 'DidMethod is not compatible with the protocol' })
  public network?: DidMethod

  @ApiProperty({ description: 'DID' })
  @IsString()
  @MaxLength(1000)
  public did!: string

  public constructor(partial?: Partial<GetSchemaRegistrationRequest>) {
    Object.assign(this, partial)
  }
}

@ApiExtraModels(AriesCredentials, Oid4vcCredentials)
export class GetSchemaRegistrationResponse {
  @ApiProperty({ description: 'Schema is registered' })
  public registered?: boolean

  @ApiProperty({
    description: 'Schema registration details',
    oneOf: [{ $ref: getSchemaPath(AriesCredentials) }, { $ref: getSchemaPath(Oid4vcCredentials) }],
    required: false,
  })
  public credentials?: AriesCredentials | Oid4vcCredentials

  public constructor(partial?: Partial<GetSchemaRegistrationResponse>) {
    Object.assign(this, partial)
  }
}
