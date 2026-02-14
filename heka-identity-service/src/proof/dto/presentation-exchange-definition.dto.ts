import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsString, IsArray, ValidateNested, IsEnum, IsNumber, IsBoolean, IsObject } from 'class-validator'

export enum RulesEnum {
  ALL = 'all',
  PICK = 'pick',
}

export enum DirectivesEnum {
  REQUIRED = 'required',
  ALLOWED = 'allowed',
  DISALLOWED = 'disallowed',
}

export enum OptionalityEnum {
  REQUIRED = 'required',
  PREFERRED = 'preferred',
}

export class JwtObjectDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String] })
  public alg!: string[]
}

export class LdpObjectDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String] })
  public proof_type!: string[]
}

export class DiObjectDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String] })
  public proof_type!: string[]

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String] })
  public cryptosuite!: string[]
}

export class SdJwtObjectDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  public ['sd-jwt_alg_values']?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  public ['kb-jwt_alg_values']?: string[]
}

export class MsoMdocObjectDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String] })
  public alg!: string[]
}

export class FormatDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => JwtObjectDto)
  @ApiPropertyOptional({ type: () => JwtObjectDto })
  public jwt?: JwtObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => JwtObjectDto)
  @ApiPropertyOptional({ type: () => JwtObjectDto })
  public jwt_vc?: JwtObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => JwtObjectDto)
  @ApiPropertyOptional({ type: () => JwtObjectDto })
  public jwt_vc_json?: JwtObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => JwtObjectDto)
  @ApiPropertyOptional({ type: () => JwtObjectDto })
  public jwt_vp?: JwtObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => JwtObjectDto)
  @ApiPropertyOptional({ type: () => JwtObjectDto })
  public jwt_vp_json?: JwtObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => LdpObjectDto)
  @ApiPropertyOptional({ type: () => LdpObjectDto })
  public ldp?: LdpObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => LdpObjectDto)
  @ApiPropertyOptional({ type: () => LdpObjectDto })
  public ldp_vc?: LdpObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => LdpObjectDto)
  @ApiPropertyOptional({ type: () => LdpObjectDto })
  public ldp_vp?: LdpObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => DiObjectDto)
  @ApiPropertyOptional({ type: () => DiObjectDto })
  public di?: DiObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => DiObjectDto)
  @ApiPropertyOptional({ type: () => DiObjectDto })
  public di_vc?: DiObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => DiObjectDto)
  @ApiPropertyOptional({ type: () => DiObjectDto })
  public di_vp?: DiObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => SdJwtObjectDto)
  @ApiPropertyOptional({ type: () => SdJwtObjectDto })
  public ['vc+sd-jwt']?: SdJwtObjectDto

  @IsOptional()
  @ValidateNested()
  @Type(() => MsoMdocObjectDto)
  @ApiPropertyOptional({ type: () => MsoMdocObjectDto })
  public mso_mdoc?: MsoMdocObjectDto
}

export class SubmissionRequirementDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public name?: string

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public purpose?: string

  @IsEnum(RulesEnum)
  @ApiProperty({ enum: RulesEnum })
  public rule!: RulesEnum

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional()
  public count?: number

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional()
  public min?: number

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional()
  public max?: number

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public from?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmissionRequirementDto)
  @ApiPropertyOptional({ type: [SubmissionRequirementDto] })
  public from_nested?: SubmissionRequirementDto[]
}

export class SchemaDto {
  @IsString()
  @ApiProperty()
  public uri!: string

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  public required?: boolean
}

export class IssuanceDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public manifest?: string;

  [key: string]: any
}

export class PdStatusDto {
  @IsOptional()
  @IsEnum(DirectivesEnum)
  @ApiPropertyOptional({ enum: DirectivesEnum })
  public directive?: DirectivesEnum
}

export class StatusesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PdStatusDto)
  @ApiPropertyOptional({ type: () => PdStatusDto })
  public active?: PdStatusDto

  @IsOptional()
  @ValidateNested()
  @Type(() => PdStatusDto)
  @ApiPropertyOptional({ type: () => PdStatusDto })
  public suspended?: PdStatusDto

  @IsOptional()
  @ValidateNested()
  @Type(() => PdStatusDto)
  @ApiPropertyOptional({ type: () => PdStatusDto })
  public revoked?: PdStatusDto
}

export class HolderSubjectDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String] })
  public field_id!: string[]

  @IsEnum(OptionalityEnum)
  @ApiProperty({ enum: OptionalityEnum })
  public directive!: OptionalityEnum
}

export class FilterV1Dto {
  @IsOptional()
  @ApiPropertyOptional({ oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] })
  public const?: string | number | boolean

  @IsOptional()
  @IsArray()
  @ApiPropertyOptional({ type: Array<string | number | boolean> })
  public enum?: Array<string | number | boolean>

  @IsOptional()
  @ApiPropertyOptional({ oneOf: [{ type: 'string' }, { type: 'number' }] })
  public exclusiveMinimum?: string | number

  @IsOptional()
  @ApiPropertyOptional({ oneOf: [{ type: 'string' }, { type: 'number' }] })
  public exclusiveMaximum?: string | number

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public format?: string

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional()
  public minLength?: number

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional()
  public maxLength?: number

  @IsOptional()
  @ApiPropertyOptional({ oneOf: [{ type: 'string' }, { type: 'number' }] })
  public minimum?: string | number

  @IsOptional()
  @ApiPropertyOptional({ oneOf: [{ type: 'string' }, { type: 'number' }] })
  public maximum?: string | number

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional()
  public not?: object

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public pattern?: string

  @IsString()
  @ApiProperty()
  public type!: string
}

export class FieldV1Dto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public id?: string

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String] })
  public path!: string[]

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public purpose?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => FilterV1Dto)
  @ApiPropertyOptional({ type: () => FilterV1Dto })
  public filter?: FilterV1Dto

  @IsOptional()
  @IsEnum(OptionalityEnum)
  @ApiPropertyOptional({ enum: OptionalityEnum })
  public predicate?: OptionalityEnum
}

export class ConstraintsV1Dto {
  @IsOptional()
  @IsEnum(OptionalityEnum)
  @ApiPropertyOptional({ enum: OptionalityEnum })
  public limit_disclosure?: OptionalityEnum

  @IsOptional()
  @ValidateNested()
  @Type(() => StatusesDto)
  @ApiPropertyOptional({ type: () => StatusesDto })
  public statuses?: StatusesDto

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldV1Dto)
  @ApiPropertyOptional({ type: [FieldV1Dto] })
  public fields?: FieldV1Dto[]

  @IsOptional()
  @IsEnum(OptionalityEnum)
  @ApiPropertyOptional({ enum: OptionalityEnum })
  public subject_is_issuer?: OptionalityEnum

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolderSubjectDto)
  @ApiPropertyOptional({ type: [HolderSubjectDto] })
  public is_holder?: HolderSubjectDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolderSubjectDto)
  @ApiPropertyOptional({ type: [HolderSubjectDto] })
  public same_subject?: HolderSubjectDto[]
}

export class InputDescriptorV1Dto {
  @IsString()
  @ApiProperty()
  public id!: string

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public name?: string

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public purpose?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  public group?: string[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemaDto)
  @ApiProperty({ type: [SchemaDto] })
  public schema!: SchemaDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssuanceDto)
  @ApiPropertyOptional({ type: [IssuanceDto] })
  public issuance?: IssuanceDto[]

  @IsOptional()
  @ValidateNested()
  @Type(() => ConstraintsV1Dto)
  @ApiPropertyOptional({ type: () => ConstraintsV1Dto })
  public constraints?: ConstraintsV1Dto
}

export class PresentationDefinitionV1Dto {
  @IsString()
  @ApiProperty()
  public id!: string

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public name?: string

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  public purpose?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => FormatDto)
  @ApiPropertyOptional({ type: () => FormatDto })
  public format?: FormatDto

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmissionRequirementDto)
  @ApiPropertyOptional({ type: [SubmissionRequirementDto] })
  public submission_requirements?: SubmissionRequirementDto[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InputDescriptorV1Dto)
  @ApiProperty({ type: [InputDescriptorV1Dto] })
  public input_descriptors!: InputDescriptorV1Dto[]
}

export type DifPresentationExchangeDefinitionV1Dto = PresentationDefinitionV1Dto
