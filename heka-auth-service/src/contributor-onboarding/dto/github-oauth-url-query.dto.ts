import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class GithubOAuthUrlQueryDto {
  @ApiPropertyOptional({
    description: 'Optional UI path to return to after successful GitHub login.',
    example: '/profile',
  })
  @IsOptional()
  @IsString()
  public redirectPath?: string
}
