import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'

class PresentationDefinitionV2 {
  @ApiProperty({ description: 'The identifier for the presentation definition.' })
  @IsNotEmpty()
  @IsString()
  public id!: string

  @ApiPropertyOptional({ description: 'The name of the presentation definition.' })
  @IsOptional()
  @IsString()
  public name?: string

  @ApiPropertyOptional({ description: 'The purpose of the presentation definition.' })
  @IsOptional()
  @IsString()
  public purpose?: string

  @ApiPropertyOptional({ description: 'The format of the presentation definition.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => Format)
  public format?: Format

  @ApiPropertyOptional({ description: 'Submission requirements for the presentation definition.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmissionRequirement)
  public submission_requirements?: SubmissionRequirement[]

  @ApiProperty({ description: 'Input descriptors for the presentation definition.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InputDescriptorV2)
  public input_descriptors!: InputDescriptorV2[]

  @ApiPropertyOptional({ description: 'The frame object for the presentation definition.' })
  @IsOptional()
  @IsObject()
  public frame?: object
}

class Format {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => JwtObject)
  public jwt?: JwtObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => JwtObject)
  public jwt_vc?: JwtObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => JwtObject)
  public jwt_vc_json?: JwtObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => JwtObject)
  public jwt_vp?: JwtObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => JwtObject)
  public jwt_vp_json?: JwtObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => LdpObject)
  public ldp?: LdpObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => LdpObject)
  public ldp_vc?: LdpObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => LdpObject)
  public ldp_vp?: LdpObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => DiObject)
  public di?: DiObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => DiObject)
  public di_vc?: DiObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => DiObject)
  public di_vp?: DiObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => SdJwtObject)
  public ['vc+sd-jwt']?: SdJwtObject

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => MsoMdocObject)
  public mso_mdoc?: MsoMdocObject
}

class JwtObject {
  @ApiProperty({ type: [String], description: 'An array of algorithms.' })
  @IsArray()
  @IsString({ each: true })
  public alg!: string[]
}

class LdpObject {
  @ApiProperty({ type: [String], description: 'An array of proof types.' })
  @IsArray()
  @IsString({ each: true })
  public proof_type!: string[]
}

class DiObject {
  @ApiProperty({ type: [String], description: 'An array of proof types.' })
  @IsArray()
  @IsString({ each: true })
  public proof_type!: string[]

  @ApiProperty({ type: [String], description: 'An array of cryptosuites.' })
  @IsArray()
  @IsString({ each: true })
  public cryptosuite!: string[]
}

class SdJwtObject {
  @ApiPropertyOptional({ type: [String], description: 'An array of SD-JWT algorithm values.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public ['sd-jwt_alg_values']?: string[]

  @ApiPropertyOptional({ type: [String], description: 'An array of KB-JWT algorithm values.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public ['kb-jwt_alg_values']?: string[]
}

class MsoMdocObject {
  @ApiProperty({ type: [String], description: 'An array of algorithms.' })
  @IsArray()
  @IsString({ each: true })
  public alg!: string[]
}

class SubmissionRequirement {
  @ApiPropertyOptional({ description: 'The name of the submission requirement.' })
  @IsOptional()
  @IsString()
  public name?: string

  @ApiPropertyOptional({ description: 'The purpose of the submission requirement.' })
  @IsOptional()
  @IsString()
  public purpose?: string

  @ApiProperty({ description: 'The rule of the submission requirement.' })
  @IsNotEmpty()
  @IsEnum(['all', 'pick'])
  public rule!: Rules

  @ApiPropertyOptional({ description: 'The count of submission requirements.' })
  @IsOptional()
  @IsNumber()
  public count?: number

  @ApiPropertyOptional({ description: 'The minimum number of submission requirements.' })
  @IsOptional()
  @IsNumber()
  public min?: number

  @ApiPropertyOptional({ description: 'The maximum number of submission requirements.' })
  @IsOptional()
  @IsNumber()
  public max?: number

  @ApiPropertyOptional({ description: 'From which submission requirements.' })
  @IsOptional()
  @IsString()
  public from?: string

  @ApiPropertyOptional({ type: [SubmissionRequirement], description: 'Nested submission requirements.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmissionRequirement)
  public from_nested?: SubmissionRequirement[]
}

class InputDescriptorV2 {
  @ApiProperty({ description: 'The identifier for the input descriptor.' })
  @IsNotEmpty()
  @IsString()
  public id!: string

  @ApiPropertyOptional({ description: 'The name of the input descriptor.' })
  @IsOptional()
  @IsString()
  public name?: string

  @ApiPropertyOptional({ description: 'The purpose of the input descriptor.' })
  @IsOptional()
  @IsString()
  public purpose?: string

  @ApiPropertyOptional({ description: 'The format of the input descriptor.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => Format)
  public format?: Format

  @ApiPropertyOptional({ type: [String], description: 'The group of the input descriptor.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public group?: string[]

  @ApiPropertyOptional({ description: 'Issuance information for the input descriptor.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Issuance)
  public issuance?: Issuance[]

  @ApiProperty({ description: 'Constraints for the input descriptor.' })
  @ValidateNested()
  @Type(() => ConstraintsV2)
  public constraints!: ConstraintsV2
}

class Issuance {
  @ApiPropertyOptional({ description: 'The manifest of the issuance.' })
  @IsOptional()
  @IsString()
  public manifest?: string;

  [key: string]: any
}

class ConstraintsV2 {
  @ApiPropertyOptional({ description: 'Limit disclosure preference.' })
  @IsOptional()
  @IsEnum(['required', 'preferred'])
  public limit_disclosure?: Optionality

  @ApiPropertyOptional({ description: 'Statuses for constraints.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => Statuses)
  public statuses?: Statuses

  @ApiPropertyOptional({ description: 'Fields for constraints.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldV2)
  public fields?: FieldV2[]

  @ApiPropertyOptional({ description: 'Indicates if the subject is the issuer.' })
  @IsOptional()
  @IsEnum(['required', 'preferred'])
  public subject_is_issuer?: Optionality

  @ApiPropertyOptional({ description: 'Holders for constraints.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolderSubject)
  public is_holder?: HolderSubject[]

  @ApiPropertyOptional({ description: 'Same subject constraints.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolderSubject)
  public same_subject?: HolderSubject[]
}

class Statuses {
  @ApiPropertyOptional({ description: 'Active status.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PdStatus)
  public active?: PdStatus

  @ApiPropertyOptional({ description: 'Suspended status.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PdStatus)
  public suspended?: PdStatus

  @ApiPropertyOptional({ description: 'Revoked status.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PdStatus)
  public revoked?: PdStatus
}

class PdStatus {
  @ApiPropertyOptional({ description: 'Directive for the status.' })
  @IsOptional()
  @IsEnum(['required', 'allowed', 'disallowed'])
  public directive?: Directives
}

class FieldV2 {
  @ApiPropertyOptional({ description: 'The identifier for the field.' })
  @IsOptional()
  @IsString()
  public id?: string

  @ApiProperty({ type: [String], description: 'Path of the field.' })
  @IsArray()
  @IsString({ each: true })
  public path!: string[]

  @ApiPropertyOptional({ description: 'Purpose of the field.' })
  @IsOptional()
  @IsString()
  public purpose?: string

  @ApiPropertyOptional({ description: 'Filter for the field.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => FilterV2)
  public filter?: FilterV2

  @ApiPropertyOptional({ description: 'Predicate optionality.' })
  @IsOptional()
  @IsEnum(['required', 'preferred'])
  public predicate?: Optionality

  @ApiPropertyOptional({ description: 'Indicates intent to retain the field.' })
  @IsOptional()
  @IsBoolean()
  public intent_to_retain?: boolean

  @ApiPropertyOptional({ description: 'Name of the field.' })
  @IsOptional()
  @IsString()
  public name?: string

  @ApiPropertyOptional({ description: 'Indicates if the field is optional.' })
  @IsOptional()
  @IsBoolean()
  public optional?: boolean
}

class FilterV2 {
  @ApiPropertyOptional({ description: 'Constant value for the filter.' })
  @IsOptional()
  public const?: OneOfNumberStringBoolean

  @ApiPropertyOptional({ description: 'Enumeration values for the filter.' })
  @IsOptional()
  @IsArray()
  public enum?: OneOfNumberStringBoolean[]

  @ApiPropertyOptional({ description: 'Exclusive minimum for the filter.' })
  @IsOptional()
  public exclusiveMinimum?: OneOfNumberString

  @ApiPropertyOptional({ description: 'Exclusive maximum for the filter.' })
  @IsOptional()
  public exclusiveMaximum?: OneOfNumberString

  @ApiPropertyOptional({ description: 'Format for the filter.' })
  @IsOptional()
  @IsString()
  public format?: string

  @ApiPropertyOptional({ description: 'Maximum format for the filter.' })
  @IsOptional()
  public formatMaximum?: string

  @ApiPropertyOptional({ description: 'Minimum format for the filter.' })
  @IsOptional()
  public formatMinimum?: string

  @ApiPropertyOptional({ description: 'Exclusive maximum format for the filter.' })
  @IsOptional()
  public formatExclusiveMaximum?: string

  @ApiPropertyOptional({ description: 'Exclusive minimum format for the filter.' })
  @IsOptional()
  public formatExclusiveMinimum?: string

  @ApiPropertyOptional({ description: 'Minimum length for the filter.' })
  @IsOptional()
  @IsNumber()
  public minLength?: number

  @ApiPropertyOptional({ description: 'Maximum length for the filter.' })
  @IsOptional()
  @IsNumber()
  public maxLength?: number

  @ApiPropertyOptional({ description: 'Minimum value for the filter.' })
  @IsOptional()
  public minimum?: OneOfNumberString

  @ApiPropertyOptional({ description: 'Maximum value for the filter.' })
  @IsOptional()
  public maximum?: OneOfNumberString

  @ApiPropertyOptional({ description: 'Negation for the filter.' })
  @IsOptional()
  @IsObject()
  public not?: object

  @ApiPropertyOptional({ description: 'Pattern for the filter.' })
  @IsOptional()
  @IsString()
  public pattern?: string

  @ApiProperty({ description: 'Type for the filter.' })
  @IsNotEmpty()
  @IsString()
  public type!: string

  @ApiPropertyOptional({ type: FilterV2, description: 'Contains condition for the filter.' })
  @IsOptional()
  public contains?: FilterV2

  @ApiPropertyOptional({ type: FilterV2, description: 'Items for the filter.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => FilterV2)
  public items?: FilterV2
}

class HolderSubject {
  @ApiProperty({ type: [String], description: 'Field identifiers for the holder subject.' })
  @IsArray()
  @IsString({ each: true })
  public field_id!: string[]

  @ApiProperty({ description: 'Directive for the holder subject.' })
  @IsNotEmpty()
  @IsEnum(['required', 'preferred'])
  public directive!: Optionality
}

export type DifPresentationExchangeDefinitionV2 = PresentationDefinitionV2

export type DifPresentationExchangeInputDescriptor = InputDescriptorV2

type Optionality = 'required' | 'preferred'

type OneOfNumberStringBoolean = boolean | number | string

type OneOfNumberString = number | string

type Rules = 'all' | 'pick'

type Directives = 'required' | 'allowed' | 'disallowed'
