import type { OpenId4VcIssuanceSessionState } from '@credo-ts/openid4vc'
import type { OpenId4VcIssuanceSessionRecord as CredoOpenId4VcIssuanceSessionRecord } from '@credo-ts/openid4vc/build/openid4vc-issuer/repository/OpenId4VcIssuanceSessionRecord'

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { OpenId4VciCredentialOfferPayloadDto } from './credential-offer-payload.dto'

/**
 * @example "821f9b26-ad04-4f56-89b6-e2ef9c72b36e"
 */
export type RecordId = string

/**
 * @example did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 */
export type Did = string

export class OpenId4VcIssuanceSessionRecordDto {
  @ApiProperty()
  public id!: RecordId

  @ApiProperty()
  public createdAt!: Date

  @ApiPropertyOptional()
  public updatedAt?: Date

  @ApiProperty()
  public type!: string

  @ApiProperty()
  public publicIssuerId!: string

  /**
   * The state of the issuance session.
   */
  @ApiProperty()
  public state!: OpenId4VcIssuanceSessionState

  /**
   * cNonce that should be used in the credential request by the holder.
   */
  @ApiPropertyOptional()
  public cNonce?: string

  /**
   * The time at which the cNonce expires.
   */
  @ApiPropertyOptional({ type: Date })
  public cNonceExpiresAt?: Date

  /**
   * Pre authorized code used for the issuance session. Only used when a pre-authorized credential
   * offer is created.
   */
  @ApiPropertyOptional()
  public preAuthorizedCode?: string

  /**
   * Optional user pin that needs to be provided by the user in the access token request.
   */
  @ApiPropertyOptional()
  public userPin?: string

  /**
   * User-defined metadata that will be provided to the credential request to credential mapper
   * to allow to retrieve the needed credential input data. Can be the credential data itself,
   * or some other data that is needed to retrieve the credential data.
   */
  @ApiPropertyOptional()
  public issuanceMetadata?: Record<string, unknown>

  /**
   * The credential offer that was used to create the issuance session.
   */
  @ApiProperty()
  public credentialOfferPayload!: OpenId4VciCredentialOfferPayloadDto

  /**
   * URI of the credential offer. This is the url that cn can be used to retrieve
   * the credential offer
   */
  @ApiPropertyOptional()
  public credentialOfferUri?: string

  /**
   * Optional error message of the error that occurred during the issuance session. Will be set when state is {@link OpenId4VcIssuanceSessionState.Error}
   */
  @ApiPropertyOptional()
  public errorMessage?: string

  public constructor(params: OpenId4VcIssuanceSessionRecordDto) {
    this.credentialOfferPayload = params.credentialOfferPayload
    this.preAuthorizedCode = params.preAuthorizedCode
    this.publicIssuerId = params.publicIssuerId
    this.state = params.state
    this.type = params.type
    this.credentialOfferUri = params.credentialOfferUri
    this.id = params.id
    this.issuanceMetadata = params.issuanceMetadata
    this.createdAt = params.createdAt
    this.updatedAt = params.updatedAt
  }

  public static fromOpenId4VcIssuanceSessionRecord(
    record: CredoOpenId4VcIssuanceSessionRecord,
  ): OpenId4VcIssuanceSessionRecordDto {
    return new OpenId4VcIssuanceSessionRecordDto({
      ...record,
      publicIssuerId: record.issuerId,
    })
  }
}
