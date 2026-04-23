import { ApiProperty } from '@nestjs/swagger'

export class GitHubLoginResponse {
  @ApiProperty({ description: 'JWT access token' })
  public access!: string

  @ApiProperty({ description: 'JWT refresh token' })
  public refresh!: string

  @ApiProperty({ description: 'Token type', example: 'Bearer' })
  public tokenType!: string

  @ApiProperty({ description: 'Access token expiry in seconds' })
  public expiresIn!: number

  @ApiProperty({ description: 'GitHub username of the authenticated contributor' })
  public githubUsername!: string

  @ApiProperty({ description: 'GitHub user ID' })
  public githubId!: string

  @ApiProperty({ description: 'Whether this is a newly created account', example: false })
  public isNewUser!: boolean
}
