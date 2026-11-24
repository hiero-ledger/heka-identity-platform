import { ApiProperty } from '@nestjs/swagger'

export class ContributorCredentialOfferResponseDto {
  @ApiProperty({
    description: 'Credential offer URI (openid-credential-offer://) for the wallet',
    example: 'openid-credential-offer://?credential_offer_uri=https://...',
  })
  public credentialOffer!: string

  /**
   * One-time numeric code the holder types into the wallet. It is not embedded
   * in the offer URI, so a leaked offer cannot be redeemed by itself.
   */
  @ApiProperty({
    description: 'Transaction code the wallet must present with the pre-authorized offer',
    example: '01234567',
  })
  public txCode!: string

  @ApiProperty({
    description: 'ISO-8601 time when the offer can no longer be redeemed',
    example: '2026-10-30T12:10:00.000Z',
  })
  public expiresAt!: string

  public constructor(credentialOffer: string, txCode: string, expiresAt: string) {
    this.credentialOffer = credentialOffer
    this.txCode = txCode
    this.expiresAt = expiresAt
  }
}
