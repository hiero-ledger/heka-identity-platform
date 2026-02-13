import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CredentialDefinitionQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public issuerDid!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public schemaId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public tag?: string
}
