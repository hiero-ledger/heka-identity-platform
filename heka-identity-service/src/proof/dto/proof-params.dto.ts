import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator'

import { RequestedAttributeDto } from './requested-attribute.dto'
import { RequestedPredicateDto } from './requested-predicate.dto'

export class SchemaIdProofParamsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public schemaId!: string
}

export class CredDefIdProofParamsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public credentialDefinitionId!: string
}

export class AttrsPredsProofParamsDto {
  @ApiPropertyOptional({ type: [RequestedAttributeDto] })
  @ValidateNested({ each: true })
  @IsOptional()
  @Type(() => RequestedAttributeDto)
  public attributes?: RequestedAttributeDto[]

  @ApiPropertyOptional({ type: [RequestedPredicateDto] })
  @ValidateNested({ each: true })
  @IsOptional()
  @Type(() => RequestedPredicateDto)
  public predicates?: RequestedPredicateDto[]

  public constructor(params?: AttrsPredsProofParamsDto) {
    this.attributes = params?.attributes
    this.predicates = params?.predicates
  }
}

export type ProofParamsDto = SchemaIdProofParamsDto | CredDefIdProofParamsDto | AttrsPredsProofParamsDto
