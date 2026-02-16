import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

import { Token } from './token'

export class RefreshRequest {
  @ApiProperty()
  @IsString()
  public readonly refresh!: string
}

export class RefreshResponse extends Token {}
