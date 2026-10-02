import { ApiProperty } from '@nestjs/swagger'

/** Shaped like an OAuth 2.0 token response (RFC 6749 section 5.1) so the web UI treats it like any other token. */
export class DemoTokenResponseDto {
  @ApiProperty({ description: 'Bearer token of the demo service account, accepted by this service' })
  public access_token!: string

  @ApiProperty({ example: 'Bearer' })
  public token_type!: 'Bearer'

  @ApiProperty({ description: 'Seconds until the token expires' })
  public expires_in!: number
}
