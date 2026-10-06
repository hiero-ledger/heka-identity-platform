import { ApiProperty } from '@nestjs/swagger'

export class IntrospectResponse {
  @ApiProperty({ description: 'Whether the presented bearer token is a stored, non-revoked, unexpired access token.' })
  public readonly active!: boolean

  public constructor(props: IntrospectResponse) {
    this.active = props.active
  }
}
