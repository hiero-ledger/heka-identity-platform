import { ApiProperty } from '@nestjs/swagger'
import { Matches } from 'class-validator'

const GITHUB_USERNAME = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/

export class GetStatusParamsDto {
  @ApiProperty({ example: 'octocat' })
  @Matches(GITHUB_USERNAME, { message: 'githubUsername is not a valid GitHub login.' })
  public githubUsername!: string
}
