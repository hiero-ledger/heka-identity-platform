import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'

export class Token {
  @ApiProperty()
  public readonly access!: string

  @ApiProperty()
  public readonly refresh!: string

  @ApiProperty()
  @Expose({ name: 'token_type' })
  public readonly tokenType!: string

  @ApiProperty()
  @Expose({ name: 'expires_in' })
  public readonly expiresIn!: number

  public constructor(props: Token) {
    this.access = props.access
    this.refresh = props.refresh
    this.tokenType = props.tokenType
    this.expiresIn = props.expiresIn
  }
}
