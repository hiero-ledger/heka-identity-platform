import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'

import { Token } from './token'

export class LoginRequest {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  public readonly name!: string

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  public readonly password!: string
}

export class LoginResponse extends Token {}
