import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'

export class CreateSchemaDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public issuerId!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public name!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public version!: string

  @ApiPropertyOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsOptional()
  public attrNames?: string[]

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  public json?: Record<string, unknown>
}
