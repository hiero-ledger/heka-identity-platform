import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator'

import {
  CredentialFormat,
  DisplayMetadata,
  OpenId4VciCredentialConfigurationSupportedWithId,
  OpenId4VciJwtVcJsonCredentialSupportedWithId,
  OpenId4VciJwtVcJsonLdCredentialSupportedWithId,
  OpenId4VciLdpVcCredentialSupportedWithId,
  OpenId4VciSdJwtCredentialSupportedWithId,
} from './common/credential'

/**
 * @example
 * {
 *   "credentialsSupported": [
 *     {
 *       "format": "vc+sd-jwt",
 *       "id": "ExampleCredentialSdJwtVc",
 *       "vct": "https://example.com/vct#ExampleCredential",
 *       "cryptographic_binding_methods_supported": [
 *         "did:key",
 *         "did:jwk"
 *       ],
 *       "cryptographic_suites_supported": [
 *         "ES256",
 *         "Ed25519"
 *       ],
 *       "display": [
 *         {
 *           "name": "Example SD JWT Credential",
 *           "description": "This is an example SD-JWT credential",
 *           "background_color": "#ffffff",
 *           "background_image": {
 *             "url": "https://example.com/background.png",
 *             "alt_text": "Example Credential Background"
 *           },
 *           "text_color": "#000000",
 *           "locale": "en-US",
 *           "logo": {
 *             "url": "https://example.com/logo.png",
 *             "alt_text": "Example Credential Logo"
 *           }
 *         }
 *       ]
 *     },
 *     {
 *       "format": "jwt_vc_json",
 *       "id": "ExampleCredentialJwtVc",
 *       "types": [
 *         "VerifiableCredential",
 *         "ExampleCredential"
 *       ],
 *       "cryptographic_binding_methods_supported": [
 *         "did:key",
 *         "did:jwk"
 *       ],
 *       "cryptographic_suites_supported": [
 *         "ES256",
 *         "Ed25519"
 *       ],
 *       "display": [
 *         {
 *           "name": "Example SD JWT Credential",
 *           "description": "This is an example SD-JWT credential",
 *           "background_color": "#ffffff",
 *           "background_image": {
 *             "url": "https://example.com/background.png",
 *             "alt_text": "Example Credential Background"
 *           },
 *           "text_color": "#000000",
 *           "locale": "en-US",
 *           "logo": {
 *             "url": "https://example.com/logo.png",
 *             "alt_text": "Example Credential Logo"
 *           }
 *         }
 *       ]
 *     }
 *   ],
 *   "display": [
 *     {
 *       "background_color": "#ffffff",
 *       "description": "This is an example issuer",
 *       "name": "Example Issuer",
 *       "locale": "en-US",
 *       "logo": {
 *         "alt_text": "Example Issuer Logo",
 *         "url": "https://example.com/logo.png"
 *       },
 *       "text_color": "#000000"
 *     }
 *   ]
 * }
 */
export class OpenId4VcIssuersCreateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public publicIssuerId!: string

  @ApiProperty({ isArray: true, type: OpenId4VciCredentialConfigurationSupportedWithId })
  @ValidateNested({ each: true })
  @IsArray()
  @Type(() => OpenId4VciCredentialConfigurationSupportedWithId, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: 'format',
      subTypes: [
        {
          value: OpenId4VciSdJwtCredentialSupportedWithId,
          name: CredentialFormat.SdJwt,
        },
        {
          value: OpenId4VciJwtVcJsonCredentialSupportedWithId,
          name: CredentialFormat.JwtJson,
        },
        {
          value: OpenId4VciJwtVcJsonLdCredentialSupportedWithId,
          name: CredentialFormat.JwtVcJsonLd,
        },
        {
          value: OpenId4VciLdpVcCredentialSupportedWithId,
          name: CredentialFormat.LdpVc,
        },
      ],
    },
  })
  public credentialsSupported!: Array<
    | OpenId4VciSdJwtCredentialSupportedWithId
    | OpenId4VciJwtVcJsonCredentialSupportedWithId
    | OpenId4VciJwtVcJsonLdCredentialSupportedWithId
    | OpenId4VciLdpVcCredentialSupportedWithId
  >

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @Type(() => DisplayMetadata)
  public display?: DisplayMetadata[]
}
