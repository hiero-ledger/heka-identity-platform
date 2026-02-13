import { ApiProperty } from '@nestjs/swagger'
import { Length } from 'class-validator'

export class GetProfileResponse {
  @ApiProperty()
  @Length(1, 255)
  public readonly name!: string

  constructor(props: GetProfileResponse) {
    this.name = props.name
  }
}
