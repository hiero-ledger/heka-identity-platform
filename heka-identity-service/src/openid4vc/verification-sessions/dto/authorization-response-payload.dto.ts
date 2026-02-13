import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsString, IsArray, IsNumber, ValidateNested, IsObject, IsDateString } from 'class-validator'

import { IsValidDynamicObject } from '../../../utils/validation'

class AdditionalClaimsDto {
  [x: string]: any
}

class DescriptorDto {
  @ApiProperty()
  @IsString()
  public id!: string

  @ApiProperty()
  @IsString()
  public path!: string

  @ApiPropertyOptional({ type: () => DescriptorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DescriptorDto)
  public path_nested?: DescriptorDto

  @ApiProperty()
  @IsString()
  public format!: string
}

class PresentationSubmissionDto {
  @ApiProperty()
  @IsString()
  public id!: string

  @ApiProperty()
  @IsString()
  public definition_id!: string

  @ApiProperty({ type: [DescriptorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DescriptorDto)
  public descriptor_map!: DescriptorDto[]
}

class ProofDto {
  @ApiProperty()
  @IsString()
  public type!: string

  @ApiProperty()
  @IsDateString()
  public created!: string

  @ApiProperty()
  @IsString()
  public proofPurpose!: string

  @ApiProperty()
  @IsString()
  public verificationMethod!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public challenge?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public domain?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public proofValue?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public jws?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public jwt?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public nonce?: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public requiredRevealStatements?: string[];

  [x: string]: any
}

class HasProofDto {
  @ApiPropertyOptional({ type: () => [ProofDto], isArray: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProofDto)
  public proof?: ProofDto | ProofDto[]
}

class IIssuerDto {
  @ApiProperty()
  @IsString()
  public id!: string;

  [x: string]: any
}

class CredentialSchemaDto {
  @ApiProperty()
  @IsString()
  public id!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public type?: string
}

class CredentialStatusDto {
  @ApiProperty()
  @IsString()
  public id!: string

  @ApiProperty()
  @IsString()
  public type!: string
}

class CredentialSubjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public id?: string;

  [x: string]: any
}

class CredentialDto {
  @ApiProperty({ type: Array<string | AdditionalClaimsDto> })
  @IsArray()
  public '@context': Array<string | AdditionalClaimsDto>

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  public type!: string[]

  @ApiPropertyOptional({ type: () => [CredentialSchemaDto, String], isArray: true })
  @IsOptional()
  public credentialSchema?: CredentialSchemaDto | CredentialSchemaDto[] | string | string[]

  @ApiProperty({ type: () => IIssuerDto })
  @ValidateNested()
  @Type(() => IIssuerDto)
  @IsValidDynamicObject({ allowedTypes: ['string', 'object'] })
  public issuer!: IIssuerDto | string

  @ApiProperty()
  @IsString()
  public issuanceDate!: string

  @ApiProperty({ type: [CredentialSubjectDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CredentialSubjectDto)
  public credentialSubject!: CredentialSubjectDto[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public expirationDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public id?: string

  @ApiPropertyOptional({ type: () => CredentialStatusDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CredentialStatusDto)
  public credentialStatus?: CredentialStatusDto

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public name?: string;

  [x: string]: any
}

class VerifiableCredentialDto extends CredentialDto implements HasProofDto {
  @ApiPropertyOptional({ type: () => [ProofDto], isArray: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProofDto)
  public proof?: ProofDto | ProofDto[]
}

class W3CVerifiableCredentialDto {
  @ApiPropertyOptional({ type: () => VerifiableCredentialDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VerifiableCredentialDto)
  public verifiableCredential?: VerifiableCredentialDto

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public compactJwt?: string
}

class PresentationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public id?: string

  @ApiProperty({ type: Array<string | AdditionalClaimsDto> })
  @IsArray()
  public '@context': Array<string | AdditionalClaimsDto>

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public type?: string | string[]

  @ApiPropertyOptional({ type: [W3CVerifiableCredentialDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => W3CVerifiableCredentialDto)
  public verifiableCredential?: W3CVerifiableCredentialDto[]

  @ApiPropertyOptional({ type: () => PresentationSubmissionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PresentationSubmissionDto)
  public presentation_submission?: PresentationSubmissionDto

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public holder?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public verifier?: string;

  [x: string]: any
}

export type VerifiablePresentationDto = PresentationDto & HasProofDto

export type W3CVerifiablePresentationDto = VerifiablePresentationDto | string
// class W3CVerifiablePresentationDto {
//   @ApiPropertyOptional({ type: () => VerifiablePresentationDto })
//   @IsOptional()
//   @ValidateNested()
//   @Type(() => VerifiablePresentationDto)
//   public verifiablePresentation?: VerifiablePresentationDto
//
//   @ApiPropertyOptional()
//   @IsOptional()
//   @IsString()
//   public compactJwt?: string
// }

class AuthorizationResponsePayloadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public access_token?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public token_type?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public refresh_token?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  public expires_in?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public state?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public id_token?: string

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested({ each: true })
  // TODO: remove any and specify proper types
  public vp_token?: any

  @ApiPropertyOptional({ type: () => PresentationSubmissionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PresentationSubmissionDto)
  public presentation_submission?: PresentationSubmissionDto

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  public verifiedData?: PresentationDto | AdditionalClaimsDto;

  [x: string]: any
}

export type OpenId4VcSiopAuthorizationResponsePayload = AuthorizationResponsePayloadDto
