import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class FindIssuerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public publicIssuerId!: string
}
