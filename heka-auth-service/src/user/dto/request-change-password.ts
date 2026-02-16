import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'

export class RequestChangePasswordRequest {
  @ApiProperty()
  @Length(1, 255)
  public readonly name!: string

  @ApiProperty()
  @Length(1, 255)
  public readonly oldPassword!: string
}

export class RequestChangePasswordResponse {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  public readonly token!: string

  public constructor(props: RequestChangePasswordResponse) {
    this.token = props.token
  }
}
