import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'

export class LogoutRequest {
  @ApiProperty()
  @IsString()
  @Length(1, 500)
  public readonly refresh!: string
}
