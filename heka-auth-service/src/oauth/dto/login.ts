import { ApiProperty } from '@nestjs/swagger'
import { Length } from 'class-validator'

import { Token } from './token'

export class LoginRequest {
  @ApiProperty()
  @Length(1, 255)
  public readonly name!: string

  @ApiProperty()
  @Length(1, 255)
  public readonly password!: string
}

export class LoginResponse extends Token {}
