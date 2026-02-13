import { OpenId4VcIssuanceSessionState } from '@credo-ts/openid4vc'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'

export class GetIssuanceSessionByQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public cNonce?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public publicIssuerId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public preAuthorizedCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public credentialOfferUri?: string

  @ApiPropertyOptional({ enum: OpenId4VcIssuanceSessionState })
  @IsOptional()
  @IsEnum(OpenId4VcIssuanceSessionState)
  public state?: OpenId4VcIssuanceSessionState
}
