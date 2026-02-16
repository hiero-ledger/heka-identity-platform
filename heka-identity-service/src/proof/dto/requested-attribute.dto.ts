import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class RequestedAttributeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public name!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public schemaId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public credentialDefinitionId?: string
}
