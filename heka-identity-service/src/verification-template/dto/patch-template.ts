import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { ApiProperty } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayUnique,
  IsBoolean,
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
import { ToBooleanTransformer } from '../../utils/transformation'
import { IsCorrectForProtocol } from '../../utils/validation'

import { VerificationTemplate } from './common/verification-template'

export class PatchVerificationTemplateFieldRequest {
  @ApiProperty({ description: 'The generic schema field id' })
  @IsUUID()
  public schemaFieldId!: string
}

export class PatchVerificationTemplateRequest {
  @ApiProperty({ description: 'Template name', required: false })
  @IsOptional()
  @MinLength(1)
  @MaxLength(500)
  public readonly name?: string

  @ApiProperty({ description: 'Protocol', enum: ProtocolType })
  @IsOptional()
  @IsEnum(ProtocolType)
  public protocol?: ProtocolType

  @ApiProperty({
    description: 'Credential format',
    enum: { ...AriesCredentialFormat, ...OpenId4VciCredentialFormatProfile },
  })
  @IsOptional()
  @IsEnum({ ...AriesCredentialFormat, ...OpenId4VciCredentialFormatProfile })
  @IsCorrectForProtocol('protocol', credentialTypes, {
    message: 'CredentialFormat is not compatible with the protocol',
  })
  public credentialFormat?: CredentialFormat

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
  @IsOptional()
  @IsString()
  public schemaId?: string

  @ApiProperty({
    description: 'Credential values',
    type: PatchVerificationTemplateFieldRequest,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @ArrayUnique((f) => f.schemaFieldId)
  @ValidateNested({ each: true })
  @Type(() => PatchVerificationTemplateFieldRequest)
  public fields?: PatchVerificationTemplateFieldRequest[]

  @ApiProperty({ description: 'Previous template id', required: false })
  @IsOptional()
  public readonly previousTemplateId?: string | null

  @ApiProperty({ description: 'Pinned', required: false, type: Boolean })
  @Transform(ToBooleanTransformer)
  @IsOptional()
  @IsBoolean()
  public readonly isPinned?: boolean

  public constructor(partial?: Partial<PatchVerificationTemplateRequest>) {
    Object.assign(this, partial)
  }
}

export class PatchVerificationTemplateResponse extends VerificationTemplate {
  public constructor(partial?: Partial<PatchVerificationTemplateResponse>) {
    super(partial)
    Object.assign(this, partial)
  }
}
