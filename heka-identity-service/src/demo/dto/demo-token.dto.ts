import { ApiProperty } from '@nestjs/swagger'

export class DemoTokenResponseDto {
  @ApiProperty({ description: 'Bearer token of the demo service account, accepted by this service' })
  public access_token!: string

  @ApiProperty({ example: 'Bearer' })
  public token_type!: 'Bearer'

  @ApiProperty({ description: 'Seconds until the token expires' })
  public expires_in!: number
}
