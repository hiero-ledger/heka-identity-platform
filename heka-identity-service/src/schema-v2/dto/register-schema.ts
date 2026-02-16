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

export class RegisterSchemaRequest {
  @ApiProperty({ description: 'Protocol', enum: ProtocolType })
  @IsEnum(ProtocolType)
  public protocol!: ProtocolType

  @ApiProperty({
    description: 'Credential format',
    enum: { ...AriesCredentialRegistrationFormat, ...OpenId4VCCredentialRegistrationFormat },
    required: false,
  })
  @IsEnum({ ...AriesCredentialRegistrationFormat, ...OpenId4VCCredentialRegistrationFormat })
  @IsCorrectForProtocol('protocol', protocolCredentialRegistrationFormats, {
    message: 'CredentialFormat is not compatible with the protocol',
  })
  public credentialFormat!: CredentialRegistrationFormat

  @ApiProperty({ description: 'Network', enum: DidMethod, required: false })
  @IsEnum(DidMethod)
  @IsCorrectForProtocol('protocol', didMethods, { message: 'DidMethod is not compatible with the protocol' })
  public network?: DidMethod

  @ApiProperty({ description: 'DID' })
  @IsString()
  @MaxLength(1000)
  public did!: string

  public constructor(partial?: Partial<RegisterSchemaRequest>) {
    Object.assign(this, partial)
  }
}

@ApiExtraModels(AriesCredentials, Oid4vcCredentials)
export class RegisterSchemaResponse {
  @ApiProperty({
    description: 'Schema registration details',
    oneOf: [{ $ref: getSchemaPath(AriesCredentials) }, { $ref: getSchemaPath(Oid4vcCredentials) }],
    required: false,
  })
  public credentials?: AriesCredentials | Oid4vcCredentials

  public constructor(partial?: Partial<RegisterSchemaResponse>) {
    Object.assign(this, partial)
  }
}
