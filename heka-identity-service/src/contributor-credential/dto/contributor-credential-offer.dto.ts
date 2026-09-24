import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class ContributorCredentialOfferRequestDto {
  /**
   * The contributor's immutable GitHub numeric account ID.
   * This is the binding anchor used to look up the verified
   * `ContributorBinding` record.
   *
   * @example "12345678"
   */
  @ApiProperty({
    description: "The contributor's immutable GitHub numeric account ID",
    example: '12345678',
  })
  @IsString()
  @IsNotEmpty()
  public githubAccountId!: string
}

export class ContributorCredentialOfferResponseDto {
  /**
   * An `openid-credential-offer://` URI that a compatible wallet application
   * can scan or follow to retrieve the issued SD-JWT VC.
   *
   * @example "openid-credential-offer://?credential_offer_uri=https%3A%2F%2F..."
   */
  @ApiProperty({
    description: 'Credential offer URI (openid-credential-offer://) for the wallet',
    example: 'openid-credential-offer://?credential_offer_uri=https://...',
  })
  public credentialOffer!: string

  public constructor(credentialOffer: string) {
    this.credentialOffer = credentialOffer
  }
}
