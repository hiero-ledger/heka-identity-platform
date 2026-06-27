import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator'

import { DcqlQueryDto } from './dcql-query.dto'
import { DifPresentationExchangeDefinitionV2 } from './presentation-exchange-definition.dto'
import { OpenId4VcVerificationSessionRecordDto } from './verification-session.dto'

/**
 * How the OpenID4VP authorization request is signed.
 * - `did`  — sign with `did` (the shipped default).
 * - `x5c`  — sign with the tenant's X.509 signer (`clientIdPrefix` / `certificateId`).
 * - `none` — unsigned (the DC API `web-origin` fallback).
 */
export class RequestSignerDto {
  @ApiProperty({ enum: ['did', 'x5c', 'none'] })
  @IsIn(['did', 'x5c', 'none'])
  public method!: 'did' | 'x5c' | 'none'

  @ApiPropertyOptional({ description: 'Signing DID. Required when method is "did".' })
  @ValidateIf((o: RequestSignerDto) => o.method === 'did')
  @IsString()
  @IsNotEmpty()
  public did?: string

  @ApiPropertyOptional({
    enum: ['x509_hash', 'x509_san_dns'],
    description: 'X.509 client_id prefix (method "x5c"). Defaults to x509_hash.',
  })
  @ValidateIf((o: RequestSignerDto) => o.method === 'x5c')
  @IsOptional()
  @IsIn(['x509_hash', 'x509_san_dns'])
  public clientIdPrefix?: 'x509_hash' | 'x509_san_dns'

  @ApiPropertyOptional({
    description: 'Specific X.509 signer id (method "x5c"). Defaults to the tenant default for the prefix.',
  })
  @ValidateIf((o: RequestSignerDto) => o.method === 'x5c')
  @IsOptional()
  @IsString()
  public certificateId?: string
}

/**
 * @example
 * {
 *   "publicVerifierId": "1ab30c0e-1adb-4f01-90e8-cfd425c0a311",
 *   "requestSigner": {
 *     "method": "did",
 *     "did": "did:key:z6MkgViwfstCL1L9i8tgsdAYEu5A62W5mA9DcmSygVVVLFuU"
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

  @ApiPropertyOptional({
    type: RequestSignerDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RequestSignerDto)
  public requestSigner?: RequestSignerDto

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
  })
  @IsOptional()
  @IsString()
  public responseMode?: 'direct_post' | 'direct_post.jwt' | 'dc_api' | 'dc_api.jwt'

  @ApiPropertyOptional({
    type: [String],
  })
  @IsOptional()
  public expectedOrigins?: string[]
}

export class OpenId4VcVerifyDcApiRequestDto {
  @ApiProperty()
  @IsObject()
  public authorizationResponse!: Record<string, unknown>

  @ApiProperty()
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
