import { ApiProperty } from '@nestjs/swagger'

export class GpgChallengeResponseDto {
  @ApiProperty({ description: 'Id to submit with the signature', example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  public challengeId!: string

  @ApiProperty({ description: '64-character hex nonce to clear-sign' })
  public nonce!: string

  @ApiProperty({ description: 'The nonce is single-use and expires 5 minutes after it is issued' })
  public expiresAt!: Date

  @ApiProperty({ description: 'GitHub login whose published key must have made the signature', example: 'octocat' })
  public githubUsername!: string

  @ApiProperty({ example: '583231' })
  public githubAccountId!: string
}
