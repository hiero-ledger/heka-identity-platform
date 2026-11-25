import { ApiProperty } from '@nestjs/swagger'

export class GithubLinkStartResponseDto {
  @ApiProperty({
    description:
      'GitHub authorization URL with a single-use state and a PKCE challenge. The server keeps only the state hash and the verifier.',
  })
  public authorizationUrl!: string
}

export class GithubLinkCallbackResponseDto {
  @ApiProperty({ enum: [true] })
  public linked!: true

  @ApiProperty({ description: 'GitHub login of the linked account', example: 'octocat' })
  public githubUsername!: string
}
