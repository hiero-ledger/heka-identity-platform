import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator'

class CredentialOfferPayloadV1_0_11Dto {
  @ApiProperty({
    description: 'The URL of the Credential Issuer, the Wallet is requested to obtain one or more Credentials from.',
  })
  @IsNotEmpty()
  @IsString()
  public credential_issuer!: string

  @ApiProperty({
    description: 'A JSON array, where every entry is a JSON object or a JSON string related to the credential type.',
    type: [Object],
  })
  @IsNotEmpty()
  @ValidateNested({ each: true })
  public credentials!: (CredentialOfferFormat | string)[]

  @ApiPropertyOptional({
    description:
      "A JSON object indicating the Grant Types the Credential Issuer's AS is prepared to process for this credential offer.",
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GrantDto)
  public grants?: GrantDto

  @ApiPropertyOptional({ description: 'Client ID for implementations like EBSI in a same-device flow.' })
  @IsOptional()
  @IsString()
  public client_id?: string
}

class CredentialOfferPayloadV1_0_13Dto {
  @ApiProperty({ description: 'The URL of the Credential Issuer, as defined in Section 11.2.1.' })
  @IsNotEmpty()
  @IsString()
  public credential_issuer!: string

  @ApiProperty({
    description:
      'Array of unique strings that each identify one of the keys in the name/value pairs stored in credential_configurations_supported Credential Issuer metadata.',
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  public credential_configuration_ids!: string[]

  @ApiPropertyOptional({
    description:
      "A JSON object indicating the Grant Types the Credential Issuer's AS is prepared to process for this credential offer.",
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GrantDto)
  public grants?: GrantDto

  @ApiPropertyOptional({ description: 'Client ID for implementations like EBSI in a same-device flow.' })
  @IsOptional()
  @IsString()
  public client_id?: string
}

class CommonCredentialOfferFormatDto {
  @ApiProperty({ description: 'The format of the credential to be requested.' })
  @IsNotEmpty()
  @IsString()
  public format!: OID4VCICredentialFormat | string
}

class CredentialOfferFormatJwtVcJsonLdAndLdpVcDto extends CommonCredentialOfferFormatDto {
  @ApiProperty({ description: 'The format must be ldp_vc or jwt_vc_json-ld.' })
  @IsNotEmpty()
  @IsString()
  public format!: 'ldp_vc' | 'jwt_vc_json-ld'

  @ApiProperty({ description: 'JSON object containing the detailed description of the credential type.' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => JsonLdIssuerCredentialDefinitionDto)
  public credential_definition!: JsonLdIssuerCredentialDefinitionDto
}

class JsonLdIssuerCredentialDefinitionDto {
  @ApiProperty({ description: 'The context of the credential.', type: [Object] })
  @IsArray()
  @IsNotEmpty()
  public '@context': ICredentialContextType[]

  @ApiProperty({ description: 'The types of the credential.', type: [String] })
  @IsArray()
  @IsNotEmpty()
  public types!: string[]

  @ApiPropertyOptional({ description: 'Credential subject information.' })
  public credentialSubject?: IssuerCredentialSubject
}

class IssuerCredentialSubject {
  [key: string]: IssuerCredentialSubjectDisplayDto
}

class IssuerCredentialSubjectDisplayDto {
  @ApiPropertyOptional({ description: 'Indicates whether the claim must be present in the issued Credential.' })
  @IsOptional()
  public mandatory?: boolean

  @ApiPropertyOptional({ description: 'Type of value of the claim.' })
  @IsOptional()
  public value_type?: string

  @ApiPropertyOptional({ description: 'An array of objects containing display properties for the Credential claim.' })
  public display?: NameAndLocaleDto[]
}

class NameAndLocaleDto {
  @ApiPropertyOptional({ description: 'String value of a display name for the Credential.' })
  @IsOptional()
  public name?: string

  @ApiPropertyOptional({ description: 'Language of this object represented as a language tag.' })
  @IsOptional()
  public locale?: string;

  [key: string]: unknown
}

export type ICredentialContextType = (CredentialContextDto & AdditionalClaims) | string

export class CredentialContextDto {
  @ApiPropertyOptional()
  @IsOptional()
  public name?: string

  @ApiPropertyOptional()
  @IsOptional()
  public did?: string
}

type AdditionalClaims = Record<string, any>

class CredentialOfferFormatJwtVcJsonDto extends CommonCredentialOfferFormatDto {
  @ApiProperty({ description: 'The format must be jwt_vc_json or jwt_vc.' })
  @IsNotEmpty()
  @IsString()
  public format!: 'jwt_vc_json' | 'jwt_vc'

  @ApiProperty({ description: 'Types of credentials.', type: [String] })
  @IsArray()
  @IsNotEmpty()
  public types!: string[]
}

class CredentialOfferFormatSdJwtVcDto extends CommonCredentialOfferFormatDto {
  @ApiProperty({ description: 'The format must be vc+sd-jwt.' })
  @IsNotEmpty()
  @IsString()
  public format!: 'vc+sd-jwt'

  @ApiProperty({ description: 'The VCT string.' })
  @IsNotEmpty()
  @IsString()
  public vct!: string

  @ApiPropertyOptional({ description: 'Issuer credential subject claims.' })
  @IsOptional()
  @IsObject()
  public claims?: IssuerCredentialSubject
}

class GrantDto {
  @ApiPropertyOptional({ description: 'Grant authorization code.' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GrantAuthorizationCodeDto)
  public authorization_code?: GrantAuthorizationCodeDto

  @ApiPropertyOptional({ description: 'Pre-authorized grant code.' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GrantUrnIetfDto)
  public 'urn:ietf:params:oauth:grant-type:pre-authorized_code'?: GrantUrnIetfDto
}

class GrantAuthorizationCodeDto {
  @ApiPropertyOptional({
    description: 'String used to bind the subsequent Authorization Request with the Credential Issuer.',
  })
  @IsOptional()
  @IsString()
  public issuer_state?: string

  @ApiPropertyOptional({ description: 'String that the Wallet can use to identify the Authorization Server.' })
  @IsOptional()
  @IsString()
  public authorization_server?: string
}

class GrantUrnIetfDto {
  @ApiProperty({
    description: "Code representing the Credential Issuer's authorization for the Wallet to obtain Credentials.",
  })
  @IsNotEmpty()
  @IsString()
  public 'pre-authorized_code': string

  @ApiPropertyOptional({ description: 'Object specifying whether a Transaction Code is expected.' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TxCodeDto)
  public tx_code?: TxCodeDto

  @ApiPropertyOptional({ description: 'Minimum amount of time in seconds for polling requests.' })
  @IsOptional()
  @IsNumber()
  public interval?: number

  @ApiPropertyOptional({ description: 'Authorization Server identifier to use with this grant type.' })
  @IsOptional()
  @IsString()
  public authorization_server?: string

  @ApiPropertyOptional({
    description: 'Boolean value specifying whether the AS expects presentation of the End-User PIN.',
  })
  @IsOptional()
  public user_pin_required?: boolean
}

class TxCodeDto {
  @ApiPropertyOptional({ description: 'Input character set: numeric or text.' })
  @IsOptional()
  @IsString()
  public input_mode?: InputCharSet

  @ApiPropertyOptional({ description: 'Length of the Transaction Code.' })
  @IsOptional()
  @IsNumber()
  public length?: number

  @ApiPropertyOptional({ description: 'Guidance for the Holder of the Wallet on how to obtain the Transaction Code.' })
  @IsOptional()
  @IsString()
  public description?: string
}

type OID4VCICredentialFormat = 'jwt_vc_json' | 'jwt_vc_json-ld' | 'ldp_vc' | 'vc+sd-jwt' | 'jwt_vc'

type InputCharSet = 'numeric' | 'text'

type CredentialOfferFormat = CommonCredentialOfferFormatDto &
  (CredentialOfferFormatJwtVcJsonLdAndLdpVcDto | CredentialOfferFormatJwtVcJsonDto | CredentialOfferFormatSdJwtVcDto)

export type OpenId4VciCredentialOfferPayloadDto = CredentialOfferPayloadV1_0_11Dto | CredentialOfferPayloadV1_0_13Dto
