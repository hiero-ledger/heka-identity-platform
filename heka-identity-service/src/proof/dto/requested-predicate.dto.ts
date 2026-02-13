import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator'

export enum PredicateType {
  LessThan = '<',
  LessThanOrEqualTo = '<=',
  GreaterThan = '>',
  GreaterThanOrEqualTo = '>=',
}

export class RequestedPredicateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public name!: string

  @ApiProperty({ enum: PredicateType })
  @IsEnum(PredicateType)
  public type!: PredicateType

  @ApiProperty()
  @IsNumber()
  public value!: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public schemaId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public credentialDefinitionId?: string
}
