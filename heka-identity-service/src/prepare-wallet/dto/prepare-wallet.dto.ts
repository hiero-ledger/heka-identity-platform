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

export enum PreparedDidStatus {
  /** Created by this call */
  Created = 'created',
  /** Already in the wallet */
  Existing = 'existing',
  /** Not created, or its OID4VC records are missing; a later call retries */
  Failed = 'failed',
  /** Not allowed for the caller's role */
  Skipped = 'skipped',
}

export class PreparedDidDto {
  @ApiProperty({ enum: DidMethod })
  public readonly method!: string

  @ApiPropertyOptional()
  public readonly did?: string

  @ApiProperty({ enum: PreparedDidStatus })
  public readonly status!: PreparedDidStatus

  @ApiPropertyOptional({ description: 'Why the DID or its OID4VC records could not be created' })
  public readonly error?: string
}

export class PrepareWalletResponseDto {
  @ApiProperty({ description: 'The main DID of the wallet' })
  public readonly did: string

  @ApiProperty({ type: [PreparedDidDto], description: 'The DID of each enabled method' })
  public readonly dids: PreparedDidDto[]

  public constructor(params: PrepareWalletResponseDto) {
    this.did = params.did
    this.dids = params.dids
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
