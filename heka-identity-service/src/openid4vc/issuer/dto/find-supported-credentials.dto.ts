import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class FindSupportedCredentialsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public publicIssuerId!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public credentialType?: string
}
