import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsNotEmpty, IsNotEmptyObject, IsOptional, IsString, ValidateNested } from 'class-validator'

import { DifPresentationExchangeDefinitionV1Dto } from './presentation-exchange-definition.dto'
import {
  AttrsPredsProofParamsDto,
  CredDefIdProofParamsDto,
  ProofParamsDto,
  SchemaIdProofParamsDto,
} from './proof-params.dto'

export enum ProofRequestFormat {
  AnoncredsIndy = 'anoncreds-indy',
  DifPresentationExchange = 'dif-presentation-exchange',
}

class Request {
  @ApiProperty({ enum: ProofRequestFormat })
  @IsEnum(ProofRequestFormat)
  public format!: ProofRequestFormat
}

@ApiExtraModels(CredDefIdProofParamsDto, SchemaIdProofParamsDto, AttrsPredsProofParamsDto)
export class AnoncredsProofRequestDto extends Request {
  @ApiProperty({ enum: ProofRequestFormat })
  @IsEnum(ProofRequestFormat)
  public format!: ProofRequestFormat.AnoncredsIndy

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public name!: string

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(CredDefIdProofParamsDto) },
      { $ref: getSchemaPath(SchemaIdProofParamsDto) },
      { $ref: getSchemaPath(AttrsPredsProofParamsDto) },
    ],
  })
  @ValidateNested({ each: true })
  @IsNotEmptyObject()
  @Type((typeHelpOptions) => {
    const proofParams = typeHelpOptions?.object?.proofParams

    if (typeof proofParams === 'object' && proofParams !== null) {
      if ('schemaId' in proofParams) {
        return SchemaIdProofParamsDto
      } else if ('credentialDefinitionId' in proofParams) {
        return CredDefIdProofParamsDto
      }
    }

    return AttrsPredsProofParamsDto
  })
  public proofParams!: ProofParamsDto
}

export class DifPresentationExchangeDto extends Request {
  @ApiProperty({ enum: ProofRequestFormat })
  @IsEnum(ProofRequestFormat)
  public format!: ProofRequestFormat.DifPresentationExchange

  @ApiPropertyOptional()
  @IsOptional()
  public presentationExchange?: DifPresentationExchangeDefinitionV1Dto
}

export class ProofRequestDto {
  @ApiProperty()
  @IsString()
  public connectionId!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public comment?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public requestNonRevokedProof?: boolean

  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(AnoncredsProofRequestDto) }, { $ref: getSchemaPath(DifPresentationExchangeDto) }],
  })
  @ValidateNested({ each: true })
  @Type(() => Request, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: 'format',
      subTypes: [
        {
          value: AnoncredsProofRequestDto,
          name: ProofRequestFormat.AnoncredsIndy,
        },
        {
          value: DifPresentationExchangeDto,
          name: ProofRequestFormat.DifPresentationExchange,
        },
      ],
    },
  })
  public request!: AnoncredsProofRequestDto | DifPresentationExchangeDto
}
