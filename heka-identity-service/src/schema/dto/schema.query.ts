import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class SchemaQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public issuerDid!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public version?: string
}
