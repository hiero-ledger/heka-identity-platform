import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { plainToInstance, Transform, Type } from 'class-transformer'
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator'

class DcqlSdJwtVcClaimDto {
  @ApiPropertyOptional({ description: 'A string identifying the particular claim.' })
  @IsOptional()
  @IsString()
  public id?: string

  @ApiProperty({ description: 'An array of strings representing the path to the claim.' })
  @IsArray()
  @IsNotEmpty()
  public path!: (string | number | null)[]

  @ApiPropertyOptional({ description: 'An array of expected values for the claim.' })
  @IsOptional()
  @IsArray()
  public values?: (string | number | boolean)[]
}

class DcqlMsoMdocClaimPathDto {
  @ApiPropertyOptional({ description: 'A string identifying the particular claim.' })
  @IsOptional()
  @IsString()
  public id?: string

  @ApiPropertyOptional({ description: 'A boolean equivalent to IntentToRetain in ISO 18013-5.' })
  @IsOptional()
  @IsBoolean()
  public intent_to_retain?: boolean

  @ApiProperty({ description: 'An array defining a claims path pointer into an mdoc.' })
  @IsArray()
  @IsString({ each: true })
  public path!: [string, string]

  @ApiPropertyOptional({ description: 'An array of expected values for the claim.' })
  @IsOptional()
  @IsArray()
  public values?: (string | number | boolean)[]
}

class DcqlMsoMdocClaimNamespaceDto {
  @ApiPropertyOptional({ description: 'A string identifying the particular claim.' })
  @IsOptional()
  @IsString()
  public id?: string

  @ApiProperty({ description: 'A string that specifies the namespace of the data element within the mdoc.' })
  @IsString()
  public namespace!: string

  @ApiProperty({ description: 'A string that specifies the data element identifier within the namespace.' })
  @IsString()
  public claim_name!: string

  @ApiPropertyOptional({ description: 'An array of expected values for the claim.' })
  @IsOptional()
  @IsArray()
  public values?: (string | number | boolean)[]
}

class DcqlMsoMdocCredentialMetaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public doctype_value?: string
}

class DcqlSdJwtVcCredentialMetaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public vct_values?: string[]
}

class DcqlTrustedAuthorityDto {
  @ApiProperty({ description: 'The type of information about the issuer trust framework.' })
  @IsString()
  @IsNotEmpty()
  public type!: 'aki' | 'etsi_tl' | 'openid_federation'

  @ApiProperty({ description: 'An array of strings specific to the trusted authority type.' })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  public values!: [string, ...string[]]
}

abstract class DcqlCredentialDto {
  @ApiProperty({ description: 'A string identifying the Credential in the response.' })
  @IsString()
  @IsNotEmpty()
  public id!: string

  @ApiProperty({ description: 'The format of the requested Verifiable Credential.' })
  @IsString()
  @IsNotEmpty()
  public abstract format: OpenId4VciCredentialFormatProfile.MsoMdoc | OpenId4VciCredentialFormatProfile.SdJwtVc

  @ApiPropertyOptional({ description: 'An array specifying combinations of claims requested.' })
  @IsOptional()
  @IsArray()
  @IsArray({ each: true })
  @IsString({ each: true, always: true })
  @IsNotEmpty()
  public claim_sets?: [string[], ...string[][]]

  @ApiPropertyOptional({ description: 'Whether the Verifier requires a Cryptographic Holder Binding proof.' })
  @IsOptional()
  @IsBoolean()
  public require_cryptographic_holder_binding?: boolean

  @ApiPropertyOptional({ description: 'Whether multiple Credentials can be returned for this query.' })
  @IsOptional()
  @IsBoolean()
  public multiple?: boolean

  @ApiPropertyOptional({ description: 'A list of trusted authorities for this credential query.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DcqlTrustedAuthorityDto)
  public trusted_authorities?: DcqlTrustedAuthorityDto[]
}

class DcqlMsoMdocCredentialDto extends DcqlCredentialDto {
  @ApiProperty({ enum: [OpenId4VciCredentialFormatProfile.MsoMdoc] })
  @IsString()
  public format = OpenId4VciCredentialFormatProfile.MsoMdoc as const

  @ApiPropertyOptional({ description: 'A non-empty array of objects specifying mdoc claims.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value
    return value.map((item: Record<string, unknown>) =>
      'namespace' in item
        ? plainToInstance(DcqlMsoMdocClaimNamespaceDto, item)
        : plainToInstance(DcqlMsoMdocClaimPathDto, item),
    )
  })
  public claims?: [
    DcqlMsoMdocClaimPathDto | DcqlMsoMdocClaimNamespaceDto,
    ...(DcqlMsoMdocClaimPathDto | DcqlMsoMdocClaimNamespaceDto)[],
  ]

  @ApiPropertyOptional({ type: DcqlMsoMdocCredentialMetaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DcqlMsoMdocCredentialMetaDto)
  public meta?: DcqlMsoMdocCredentialMetaDto
}

class DcqlSdJwtVcCredentialDto extends DcqlCredentialDto {
  @ApiProperty({ enum: [OpenId4VciCredentialFormatProfile.SdJwtVc] })
  @IsString()
  public format = OpenId4VciCredentialFormatProfile.SdJwtVc as const

  @ApiPropertyOptional({ type: [DcqlSdJwtVcClaimDto], description: 'A non-empty array of objects specifying claims.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DcqlSdJwtVcClaimDto)
  public claims?: [DcqlSdJwtVcClaimDto, ...DcqlSdJwtVcClaimDto[]]

  @ApiPropertyOptional({ type: DcqlSdJwtVcCredentialMetaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DcqlSdJwtVcCredentialMetaDto)
  public meta?: DcqlSdJwtVcCredentialMetaDto
}

class CredentialSetQueryDto {
  @ApiProperty({ description: 'An array of credential IDs that must be presented together.' })
  @IsArray()
  @IsArray({ each: true })
  @IsString({ each: true, always: true })
  @IsNotEmpty()
  public options!: [string[], ...string[][]]

  @ApiProperty({ description: 'Whether the credentials are required.' })
  @IsBoolean()
  public required!: boolean

  @ApiPropertyOptional({ description: 'The purpose of the credential set.' })
  @IsOptional()
  @IsString()
  public purpose?: string
}

export class DcqlQueryDto {
  @ApiProperty({ description: 'A non-empty array of Credential Queries.' })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DcqlCredentialDto, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: 'format',
      subTypes: [
        { value: DcqlMsoMdocCredentialDto, name: OpenId4VciCredentialFormatProfile.MsoMdoc },
        { value: DcqlSdJwtVcCredentialDto, name: OpenId4VciCredentialFormatProfile.SdJwtVc },
      ],
    },
  })
  public credentials!: [
    DcqlMsoMdocCredentialDto | DcqlSdJwtVcCredentialDto,
    ...(DcqlMsoMdocCredentialDto | DcqlSdJwtVcCredentialDto)[],
  ]

  @ApiPropertyOptional({
    type: [CredentialSetQueryDto],
    description: 'An array of Credential Set Queries that specify required combinations of Credentials.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CredentialSetQueryDto)
  @IsNotEmpty()
  public credential_sets?: [CredentialSetQueryDto, ...CredentialSetQueryDto[]]
}
