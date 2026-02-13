import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator'

import { RevocationRegistry } from './revocation-registry.dto'

export const defaultMaximumCredentialNumber = 100

export class CreateRevocationRegistryRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public credentialDefinitionId!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public issuerId!: string

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  public maximumCredentialNumber?: number
}

export class CreateRevocationRegistryResponse extends RevocationRegistry {}
