import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { ApiProperty } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayUnique,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

import {
  AriesCredentialFormat,
  CredentialFormat,
  credentialTypes,
  DidMethod,
  didMethods,
  ProtocolType,
} from '../../common/types'
import { TrimTransformer } from '../../utils/transformation'
import { IsCorrectForProtocol } from '../../utils/validation'

import { VerificationTemplate } from './common/verification-template'

export class CreateVerificationTemplateFieldRequest {
  @ApiProperty({ description: 'The generic schema field id' })
  @IsUUID()
  public schemaFieldId!: string
}

export class CreateVerificationTemplateRequest {
  @ApiProperty({ description: 'Template name' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Transform(TrimTransformer)
  public readonly name!: string

  @ApiProperty({ description: 'Protocol', enum: ProtocolType })
  @IsEnum(ProtocolType)
  public protocol!: ProtocolType

  @ApiProperty({
    description: 'Credential format',
    enum: { ...AriesCredentialFormat, ...OpenId4VciCredentialFormatProfile },
  })
  @IsEnum({ ...AriesCredentialFormat, ...OpenId4VciCredentialFormatProfile })
  @IsCorrectForProtocol('protocol', credentialTypes, {
    message: 'CredentialFormat is not compatible with the protocol',
  })
  public credentialFormat!: CredentialFormat

  @ApiProperty({ description: 'Network', enum: DidMethod, required: false })
  @IsOptional()
  @IsEnum(DidMethod)
  @IsCorrectForProtocol('protocol', didMethods, { message: 'DidMethod is not compatible with the protocol' })
  public network?: DidMethod

  @ApiProperty({ description: 'DID', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  public did?: string

  @ApiProperty({ description: 'Schema ID' })
  @IsString()
  public schemaId!: string

  @ApiProperty({
    description: 'Credential values',
    type: CreateVerificationTemplateFieldRequest,
    isArray: true,
  })
  @ArrayUnique((f) => f.schemaFieldId)
  @ValidateNested({ each: true })
  @Type(() => CreateVerificationTemplateFieldRequest)
  public fields!: CreateVerificationTemplateFieldRequest[]

  public constructor(partial?: Partial<CreateVerificationTemplateRequest>) {
    Object.assign(this, partial)
  }
}

export class CreateVerificationTemplateResponse extends VerificationTemplate {
  public constructor(partial?: Partial<CreateVerificationTemplateResponse>) {
    super(partial)
    Object.assign(this, partial)
  }
}
