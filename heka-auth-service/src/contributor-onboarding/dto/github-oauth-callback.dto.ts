import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class GithubOAuthCallbackDto {
  @ApiProperty({ description: 'OAuth code returned by GitHub.' })
  @IsString()
  @IsNotEmpty()
  public code!: string

  @ApiProperty({ description: 'Signed OAuth state returned by the authorization-url endpoint.' })
  @IsString()
  @IsNotEmpty()
  public state!: string
}
