import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public invitationUrl!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public label?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public alias?: string
}
