import { OpenId4VcVerificationSessionState } from '@credo-ts/openid4vc'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'

export class GetVerificationSessionByQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public nonce?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public publicVerifierId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public payloadState?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public authorizationRequestUri?: string

  @ApiPropertyOptional({ enum: OpenId4VcVerificationSessionState })
  @IsOptional()
  @IsEnum(OpenId4VcVerificationSessionState)
  public state?: OpenId4VcVerificationSessionState
}
