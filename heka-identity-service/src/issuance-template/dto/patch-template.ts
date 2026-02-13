import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { ApiProperty } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
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
import { ToBooleanTransformer, ToNullTransformer } from '../../utils/transformation'
import { IsCorrectForProtocol } from '../../utils/validation'

import { IssuanceTemplate } from './common/issuance-template'

export class PatchIssuanceTemplateFieldRequest {
  @ApiProperty({ description: 'The generic schema field Id' })
  @IsUUID()
  public schemaFieldId!: string

  @ApiProperty({ description: 'Value' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  public value!: string
}

export class PatchIssuanceTemplateRequest {
  @ApiProperty({ description: 'Template name', required: false })
  @IsOptional()
  @MinLength(1)
  @MaxLength(500)
  public readonly name?: string

  @ApiProperty({ description: 'Protocol', enum: ProtocolType, required: true })
  @IsOptional()
  @IsEnum(ProtocolType)
  public protocol?: ProtocolType

  @ApiProperty({
    description: 'Credential format',
    enum: { ...AriesCredentialFormat, ...OpenId4VciCredentialFormatProfile },
    required: true,
  })
  @IsEnum({ ...AriesCredentialFormat, ...OpenId4VciCredentialFormatProfile })
  @IsOptional()
  @ValidateIf((p) => p.protocol)
  @IsCorrectForProtocol('protocol', credentialTypes, {
    message: 'CredentialFormat is not compatible with the protocol',
  })
  public credentialFormat?: CredentialFormat

  @ApiProperty({ description: 'Network', enum: DidMethod, required: true })
  @IsEnum(DidMethod)
  @IsOptional()
  @ValidateIf((p) => p.protocol)
  @IsCorrectForProtocol('protocol', didMethods, { message: 'DidMethod is not compatible with the protocol' })
  public network?: DidMethod

  @ApiProperty({ description: 'DID', required: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  public did?: string

  @ApiProperty({ description: 'Schema ID', required: true })
  @IsOptional()
  @IsUUID()
  public schemaId?: string

  @ApiProperty({
    description: 'Credential values',
    type: PatchIssuanceTemplateFieldRequest,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @ArrayNotEmpty()
  @ArrayUnique((f) => f.schemaFieldId)
  @ValidateNested({ each: true })
  @Type(() => PatchIssuanceTemplateFieldRequest)
  public fields?: PatchIssuanceTemplateFieldRequest[]

  @ApiProperty({ description: 'Previous template id (null for first)', required: false })
  @IsOptional()
  @Transform(ToNullTransformer)
  public readonly previousTemplateId?: string | null

  @ApiProperty({ description: 'Pinned', required: false, type: Boolean })
  @Transform(ToBooleanTransformer)
  @IsOptional()
  @IsBoolean()
  @ValidateIf((value) => value.isPinned)
  public readonly isPinned?: boolean

  public constructor(partial?: Partial<PatchIssuanceTemplateRequest>) {
    Object.assign(this, partial)
  }
}

export class PatchIssuanceTemplateResponse extends IssuanceTemplate {
  public constructor(partial?: Partial<PatchIssuanceTemplateResponse>) {
    super(partial)
    Object.assign(this, partial)
  }
}
