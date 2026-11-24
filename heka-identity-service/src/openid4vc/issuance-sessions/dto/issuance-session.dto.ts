import type {
  OpenId4VcIssuanceSessionState,
  OpenId4VcIssuanceSessionRecord as CredoOpenId4VcIssuanceSessionRecord,
} from '@credo-ts/openid4vc'

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

/** Whether a session's credentials can be revoked, and whether they are. */
export interface IssuanceSessionRevocation {
  revocable: boolean
  /** Only meaningful when `revocable`; undefined when the status could not be read. */
  revoked?: boolean
}

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

  /**
   * Whether the issued credentials reference a status list that wallets and verifiers check: only SD-JWT VCs,
   * through an IETF Token Status List. W3C VCs get a bitstring list entry, but the issued credentials do not
   * embed `credentialStatus`, so they stay non-revocable.
   */
  @ApiProperty({
    description:
      "true when the session's SD-JWT VCs reference an IETF Token Status List; always false for jwt_vc_json, " +
      'jwt_vc_json-ld, ldp_vc and mso_mdoc',
  })
  public revocable!: boolean

  /**
   * Present only when `revocable`: true when every status list entry of the session is invalid. Absent when the
   * token status list could not be read.
   */
  @ApiPropertyOptional({
    description:
      'Present only when revocable: true when every status list entry of the session is invalid. ' +
      'Absent when the status could not be read.',
  })
  public revoked?: boolean

  public constructor(
    params: Omit<OpenId4VcIssuanceSessionRecordDto, 'revocable' | 'revoked'>,
    revocation: IssuanceSessionRevocation = { revocable: false },
  ) {
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
    this.revocable = revocation.revocable
    if (revocation.revocable && revocation.revoked !== undefined) this.revoked = revocation.revoked
  }

  public static fromOpenId4VcIssuanceSessionRecord(
    record: CredoOpenId4VcIssuanceSessionRecord,
    revocation?: IssuanceSessionRevocation,
  ): OpenId4VcIssuanceSessionRecordDto {
    return new OpenId4VcIssuanceSessionRecordDto(
      {
        ...record,
        publicIssuerId: record.issuerId,
      },
      revocation,
    )
  }
}
