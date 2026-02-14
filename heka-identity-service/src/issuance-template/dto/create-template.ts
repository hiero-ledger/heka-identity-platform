import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator'

import {
  AriesCredentialFormat,
  CredentialFormat,
  credentialTypes,
  DidMethod,
  didMethods,
  OpenId4VcCredentialFormat,
  ProtocolType,
} from '../../common/types'
import { TrimTransformer } from '../../utils/transformation'
import { IsCorrectForProtocol } from '../../utils/validation'

import { IssuanceTemplate } from './common/issuance-template'

export class CreateIssuanceTemplateFieldRequest {
  @ApiProperty({ description: 'The generic schema field id' })
  @IsUUID()
  public schemaFieldId!: string

  @ApiPropertyOptional({ description: 'Value' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  public value?: string
}

export class CreateIssuanceTemplateRequest {
  @ApiProperty({ description: 'Template name' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Transform(TrimTransformer)
  public readonly name!: string

  @ApiProperty({ description: 'Protocol', enum: ProtocolType, required: true })
  @IsEnum(ProtocolType)
  public protocol!: ProtocolType

  @ApiProperty({
    description: 'Credential format',
    enum: { ...AriesCredentialFormat, ...OpenId4VcCredentialFormat },
    required: true,
  })
  @IsEnum({ ...AriesCredentialFormat, ...OpenId4VcCredentialFormat })
  @ValidateIf((p) => p.protocol)
  @IsCorrectForProtocol('protocol', credentialTypes, {
    message: 'CredentialFormat is not compatible with the protocol',
  })
  public credentialFormat!: CredentialFormat

  @ApiProperty({ description: 'Network', enum: DidMethod, required: true })
  @IsEnum(DidMethod)
  @ValidateIf((p) => p.protocol)
  @IsCorrectForProtocol('protocol', didMethods, { message: 'DidMethod is not compatible with the protocol' })
  public network!: DidMethod

  @ApiProperty({ description: 'DID', required: true })
  @IsString()
  @MaxLength(1000)
  public did!: string

  @ApiProperty({ description: 'Schema ID', required: true })
  @IsUUID()
  public schemaId!: string

  @ApiPropertyOptional({
    description: 'Credential values',
    type: CreateIssuanceTemplateFieldRequest,
    isArray: true,
    required: false,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateIssuanceTemplateFieldRequest)
  public fields?: CreateIssuanceTemplateFieldRequest[]

  public constructor(partial?: Partial<CreateIssuanceTemplateRequest>) {
    Object.assign(this, partial)
  }
}

export class CreateIssuanceTemplateResponse extends IssuanceTemplate {
  public constructor(partial?: Partial<CreateIssuanceTemplateResponse>) {
    super(partial)
    Object.assign(this, partial)
  }
}
