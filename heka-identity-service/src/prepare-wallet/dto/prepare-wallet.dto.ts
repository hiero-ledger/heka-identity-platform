import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator'

import {
  AriesCredentialFormat,
  CredentialFormat,
  credentialTypes,
  DidMethod,
  didMethods,
  ProtocolType,
} from 'common/types'
import { CreateSchemaRequest } from 'schema-v2/dto'
import { TransformDTOArray } from 'utils/transformation'
import { IsCorrectForProtocol } from 'utils/validation'

export class PrepareWalletResponseDto {
  @ApiProperty()
  public readonly did: string

  public constructor(params: PrepareWalletResponseDto) {
    this.did = params.did
  }
}

export class PrepareWalletRegSchemaRequest {
  @ApiProperty({ description: 'Protocol', enum: ProtocolType })
  @IsEnum(ProtocolType)
  public protocol!: ProtocolType

  @ApiProperty({
    description: 'Credential format',
    enum: { ...AriesCredentialFormat, ...OpenId4VciCredentialFormatProfile },
    required: false,
  })
  @IsEnum({ ...AriesCredentialFormat, ...OpenId4VciCredentialFormatProfile })
  @IsCorrectForProtocol('protocol', credentialTypes, {
    message: 'CredentialFormat is not compatible with the protocol',
  })
  public credentialFormat!: CredentialFormat

  @ApiProperty({ description: 'Network', enum: DidMethod, required: false })
  @IsEnum(DidMethod)
  @IsCorrectForProtocol('protocol', didMethods, { message: 'DidMethod is not compatible with the protocol' })
  public network?: DidMethod
}

export class PrepareWalletCreateSchemaRequest extends CreateSchemaRequest {
  @ApiPropertyOptional()
  @TransformDTOArray(PrepareWalletRegSchemaRequest)
  @IsOptional()
  @IsArray()
  @ValidateNested()
  public readonly registrations?: PrepareWalletRegSchemaRequest[]
}

export class PrepareWalletRequestDto {
  @ApiPropertyOptional()
  @TransformDTOArray(PrepareWalletCreateSchemaRequest)
  @IsOptional()
  @IsArray()
  @ValidateNested()
  public readonly schemas?: PrepareWalletCreateSchemaRequest[]

  @ApiPropertyOptional({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  public readonly schemaLogo?: Express.Multer.File | string

  @ApiPropertyOptional({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  public readonly userLogo?: Express.Multer.File | string
}
