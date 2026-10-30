import { ApiProperty } from '@nestjs/swagger'

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
