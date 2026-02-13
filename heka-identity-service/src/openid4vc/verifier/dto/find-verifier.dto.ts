import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class FindVerifierDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public publicVerifierId!: string
}
