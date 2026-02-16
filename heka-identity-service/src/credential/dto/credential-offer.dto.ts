import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator'

import { AriesCredentialFormat } from 'common/types'

import { CredentialPreviewAttributeDto } from './credential-preview-attribute.dto'

export class CredentialOfferDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public connectionId!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public credentialDefinitionId!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public comment?: string

  @ApiPropertyOptional({ enum: AriesCredentialFormat })
  @IsOptional()
  @IsEnum(AriesCredentialFormat)
  public format?: AriesCredentialFormat

  @ApiProperty({ type: [CredentialPreviewAttributeDto] })
  @ValidateNested({ each: true })
  @Type(() => CredentialPreviewAttributeDto)
  public attributes!: CredentialPreviewAttributeDto[]
}
