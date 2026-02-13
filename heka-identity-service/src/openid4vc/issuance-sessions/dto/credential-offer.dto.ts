import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Length, ValidateNested } from 'class-validator'

import { IsValidDynamicObject } from '../../../utils/validation'

import { OpenId4VcIssuanceSessionRecordDto } from './issuance-session.dto'

export enum CredentialVersion {
  V1Draft11_15 = 'v1.draft11-15',
  V1Draft15 = 'v1.draft15',
}

export class DisclosureFrame {
  @ApiProperty()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public _sd?: string[]
}

export class CredentialIssuer {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public method!: 'did'

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public did!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public url?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public image?: string
}

export class CredentialPayload {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public vct?: string;

  [key: string]: unknown
}

export class OpenId4VcIssuanceSessionCreateOfferCredentialOptions {
  /**
   * The id of the `credential_supported` entry that is present in the issuer
   * metadata. This id is used to identify the credential that is being offered.
   *
   * @example "ExampleCredentialSdJwtVc"
   */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public credentialSupportedId!: string

  /**
   * The format of the credential that is being offered.
   * MUST match the format of the `credential_supported` entry.
   *
   * @example {@link OpenId4VciCredentialFormatProfile.SdJwtVc}
   */
  @ApiProperty()
  @IsEnum(OpenId4VciCredentialFormatProfile)
  public format!: OpenId4VciCredentialFormatProfile

  /**
   * The issuer of the credential.
   *
   * Only DID based issuance is supported at the moment.
   */
  @ApiProperty({ type: CredentialIssuer })
  @ValidateNested()
  @Type(() => CredentialIssuer)
  public issuer!: CredentialIssuer
}

export class OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions extends OpenId4VcIssuanceSessionCreateOfferCredentialOptions {
  @ApiProperty()
  @IsEnum(OpenId4VciCredentialFormatProfile)
  public format!: OpenId4VciCredentialFormatProfile.SdJwtVc

  /**
   * The payload of the credential that will be issued.
   *
   * If `vct` claim is included, it MUST match the `vct` claim from the issuer metadata.
   * If `vct` claim is not included, it will be added automatically.
   *
   * @example
   * {
   *   "first_name": "John",
   *   "last_name": "Doe",
   *   "age": {
   *      "over_18": true,
   *      "over_21": true,
   *      "over_65": false
   *   }
   * }
   */
  @ApiProperty()
  @IsValidDynamicObject()
  public payload!: CredentialPayload

  /**
   * A disclosure frame object containing selective disclosure flags.
   *
   * @example
   * {
   *   _sd: ["age.over_21", "age.over_18", "age.over_65"]
   * }
   */
  @ApiProperty({ type: DisclosureFrame })
  @ValidateNested()
  @Type(() => DisclosureFrame)
  public disclosureFrame!: DisclosureFrame
}

export class OpenId4VcIssuanceSessionCreateOfferJwtVcJsonCredentialOptions extends OpenId4VcIssuanceSessionCreateOfferCredentialOptions {
  @ApiProperty()
  @IsEnum(OpenId4VciCredentialFormatProfile)
  public format!: OpenId4VciCredentialFormatProfile.JwtVcJson

  /**
   * The payload of the credential that will be issued.
   *
   * If `vct` claim is included, it MUST match the `vct` claim from the issuer metadata.
   * If `vct` claim is not included, it will be added automatically.
   *
   * @example
   * {
   *   "first_name": "John",
   *   "last_name": "Doe"
   * }
   */
  @ApiPropertyOptional()
  @IsOptional()
  public credentialSubject?: {
    [key: string]: unknown
  }
}

export class OpenId4VcIssuanceSessionCreateOfferJwtVcJsonLdCredentialOptions extends OpenId4VcIssuanceSessionCreateOfferCredentialOptions {
  @ApiProperty()
  @IsEnum(OpenId4VciCredentialFormatProfile)
  public format!: OpenId4VciCredentialFormatProfile.JwtVcJsonLd

  @ApiProperty()
  @IsArray()
  public '@context'!: Array<string>

  @ApiPropertyOptional()
  @IsOptional()
  public credentialSubject?: {
    [key: string]: unknown
  }
}

export class OpenId4VcIssuanceSessionCreateOfferLdpVcCredentialOptions extends OpenId4VcIssuanceSessionCreateOfferCredentialOptions {
  @ApiProperty()
  @IsEnum(OpenId4VciCredentialFormatProfile)
  public format!: OpenId4VciCredentialFormatProfile.LdpVc

  @ApiProperty()
  @IsArray()
  public '@context'!: Array<string>

  @ApiPropertyOptional()
  @IsOptional()
  public credentialSubject?: {
    [key: string]: unknown
  }

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public issuanceDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public expirationDate?: string
}

export class OpenId4VciTxCode {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public input_mode?: 'text' | 'numeric'

  @ApiProperty()
  @IsNumber()
  public length?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 300)
  public description?: string;

  [key: string]: any
}

export class OpenId4VciPreAuthorizedCodeFlowConfig {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public preAuthorizedCode?: string

  @ApiPropertyOptional({ type: OpenId4VciTxCode })
  @IsOptional()
  @ValidateNested()
  @Type(() => OpenId4VciTxCode)
  public txCode?: OpenId4VciTxCode

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public authorizationServerUrl?: string
}

export class OpenId4VcIssuanceSessionsCreateOfferDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public publicIssuerId!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public baseUri?: string

  @ApiPropertyOptional({ type: OpenId4VciPreAuthorizedCodeFlowConfig })
  @IsOptional()
  @ValidateNested()
  @Type(() => OpenId4VciPreAuthorizedCodeFlowConfig)
  public preAuthorizedCodeFlowConfig?: OpenId4VciPreAuthorizedCodeFlowConfig

  @ApiPropertyOptional()
  @IsOptional()
  public issuanceMetadata?: Record<string, unknown>

  @ApiPropertyOptional({ enum: CredentialVersion })
  @IsOptional()
  @IsEnum(CredentialVersion)
  public version?: CredentialVersion

  @ApiPropertyOptional({ type: [OpenId4VcIssuanceSessionCreateOfferCredentialOptions] })
  @ValidateNested({ each: true })
  @IsArray()
  @Type(() => OpenId4VcIssuanceSessionCreateOfferCredentialOptions, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: 'format',
      subTypes: [
        {
          value: OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions,
          name: OpenId4VciCredentialFormatProfile.SdJwtVc,
        },
        {
          value: OpenId4VcIssuanceSessionCreateOfferJwtVcJsonCredentialOptions,
          name: OpenId4VciCredentialFormatProfile.JwtVcJson,
        },
        {
          value: OpenId4VcIssuanceSessionCreateOfferJwtVcJsonLdCredentialOptions,
          name: OpenId4VciCredentialFormatProfile.JwtVcJsonLd,
        },
        {
          value: OpenId4VcIssuanceSessionCreateOfferLdpVcCredentialOptions,
          name: OpenId4VciCredentialFormatProfile.LdpVc,
        },
      ],
    },
  })
  public credentials!: Array<
    | OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions
    | OpenId4VcIssuanceSessionCreateOfferJwtVcJsonCredentialOptions
    | OpenId4VcIssuanceSessionCreateOfferJwtVcJsonLdCredentialOptions
    | OpenId4VcIssuanceSessionCreateOfferLdpVcCredentialOptions
  >
}

export class OpenId4VcIssuanceSessionsCreateOfferResponse {
  @ApiProperty({ type: OpenId4VcIssuanceSessionRecordDto })
  public issuanceSession!: OpenId4VcIssuanceSessionRecordDto

  /**
   * @example openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fexample.com%2Foid4vci%2F6b293c23-d55a-4c6a-8c6a-877d69a70b4d%2Foffers%2F6e7dce29-9d6a-4a13-a820-6a19b2ea9945
   */
  @ApiProperty()
  public credentialOffer!: string
}
