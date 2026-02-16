import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class CreateInvitationRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public label?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public alias?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public imageUrl?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public multiUseInvitation?: boolean
}
