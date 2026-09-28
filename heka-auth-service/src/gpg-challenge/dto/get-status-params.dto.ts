import { ApiProperty } from '@nestjs/swagger'
import { IsString, Matches, MaxLength } from 'class-validator'

const GITHUB_USERNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/

export class GetStatusParamsDto {
  @ApiProperty({
    description: 'GitHub login of the contributor.',
    example: 'darshit2308',
    maxLength: 39,
  })
  @IsString()
  @MaxLength(39)
  @Matches(GITHUB_USERNAME_PATTERN, {
    message: 'githubUsername must be a valid GitHub username.',
  })
  public githubUsername!: string
}
