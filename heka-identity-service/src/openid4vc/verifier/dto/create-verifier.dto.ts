import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class OpenId4VcVerifierCreateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public publicVerifierId!: string
}
