import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator'

import { CredentialIssuer } from '../../issuance-sessions/dto/credential-offer.dto'

import { DcqlQueryDto } from './dcql-query.dto'
import { DifPresentationExchangeDefinitionV2 } from './presentation-exchange-definition.dto'
import { OpenId4VcVerificationSessionRecordDto } from './verification-session.dto'

/**
 * @example
 * {
 *   "publicVerifierId": "1ab30c0e-1adb-4f01-90e8-cfd425c0a311",
 *   "requestSigner": {
 *     "method": "did",
 *     "didUrl": "did:key:z6MkgViwfstCL1L9i8tgsdAYEu5A62W5mA9DcmSygVVVLFuU#z6MkgViwfstCL1L9i8tgsdAYEu5A62W5mA9DcmSygVVVLFuU"
 *   },
 *   "presentationExchange": {
 *     "definition": {
 *       "id": "73797b0c-dae6-46a7-9700-7850855fee22",
 *       "name": "Example Presentation Definition",
 *       "input_descriptors": [
 *         {
 *           "id": "64125742-8b6c-422e-82cd-1beb5123ee8f",
 *           "constraints": {
 *             "limit_disclosure": "required",
 *             "fields": [
 *               {
 *                 "path": [
 *                   "$.age.over_18"
 *                 ],
 *                 "filter": {
 *                   "type": "boolean"
 *                 }
 *               }
 *             ]
 *           },
 *           "name": "Requested Sd Jwt Example Credential",
 *           "purpose": "To provide an example of requesting a credential"
 *         }
 *       ]
 *     }
 *   }
 * }
 */
export class OpenId4VcVerificationSessionCreateRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public publicVerifierId!: string

  @ApiProperty({ type: CredentialIssuer })
  @ValidateNested()
  @Type(() => CredentialIssuer)
  public requestSigner!: CredentialIssuer

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public idToken?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  public presentationExchange?: {
    definition: DifPresentationExchangeDefinitionV2
  }

  @ApiPropertyOptional()
  @IsOptional()
  public dcql?: {
    query: DcqlQueryDto
  }

  @ApiPropertyOptional({ enum: ['v1', 'v1.draft21', 'v1.draft24'], default: 'v1.draft21' })
  @IsOptional()
  @IsString()
  public version?: 'v1' | 'v1.draft21' | 'v1.draft24'

  @ApiPropertyOptional({
    enum: ['direct_post', 'direct_post.jwt', 'dc_api', 'dc_api.jwt'],
    description: 'Response mode for the authorization request. Use dc_api or dc_api.jwt for Digital Credentials API flow.',
  })
  @IsOptional()
  @IsString()
  public responseMode?: 'direct_post' | 'direct_post.jwt' | 'dc_api' | 'dc_api.jwt'

  @ApiPropertyOptional({
    type: [String],
    description: 'Expected origins for DC API. Required when responseMode is dc_api or dc_api.jwt.',
  })
  @IsOptional()
  public expectedOrigins?: string[]
}

export class OpenId4VcVerifyDcApiRequestDto {
  @ApiProperty({ description: 'The authorization response received from navigator.credentials.get()' })
  @IsObject()
  public authorizationResponse!: Record<string, unknown>

  @ApiProperty({ description: 'The origin of the verifier page that called navigator.credentials.get()' })
  @IsString()
  @IsNotEmpty()
  public origin!: string
}

export class OpenId4VcVerificationSessionCreateRequestResponse {
  @ApiProperty({ type: OpenId4VcVerificationSessionRecordDto })
  public verificationSession!: OpenId4VcVerificationSessionRecordDto

  /**
   * @example openid://?request_uri=https%3A%2F%2Fexample.com%2Fsiop%2F6b293c23-d55a-4c6a-8c6a-877d69a70b4d%2Fauthorization-requests%2F6e7dce29-9d6a-4a13-a820-6a19b2ea9945
   */
  @ApiProperty()
  public authorizationRequest!: string

  /**
   * The authorization request object to pass to the Digital Credentials API (navigator.credentials.get).
   * Only present when responseMode is dc_api or dc_api.jwt.
   */
  @ApiPropertyOptional()
  public authorizationRequestObject?: Record<string, unknown>
}
