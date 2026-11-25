import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class GithubLinkCallbackDto {
  @ApiProperty({ description: 'Authorization code returned by GitHub.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  public code!: string

  @ApiProperty({ description: 'State token from the authorization URL. The server stores only its hash.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  public state!: string
}
