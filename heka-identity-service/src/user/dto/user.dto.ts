import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { MessageDeliveryType } from 'common/entities/user.entity'

export class UserDto {
  @ApiPropertyOptional()
  public readonly messageDeliveryType?: MessageDeliveryType

  @ApiPropertyOptional()
  public readonly webHook?: string

  @ApiPropertyOptional()
  public readonly name?: string

  @ApiPropertyOptional()
  public readonly backgroundColor?: string

  @ApiPropertyOptional()
  public readonly logo?: string

  @ApiPropertyOptional()
  public readonly registeredAt?: Date

  @ApiProperty({
    description:
      'Whether this user may revoke issued credentials (`POST /credentials/:id/revoke`, `POST /openid4vc/issuance-session/:id/revoke`): always `true` while the role model is not enforced',
  })
  public readonly canRevokeCredentials: boolean

  public constructor(props: Partial<UserDto> & Pick<UserDto, 'canRevokeCredentials'>) {
    this.messageDeliveryType = props.messageDeliveryType
    this.webHook = props.webHook
    this.name = props.name
    this.backgroundColor = props.backgroundColor
    this.logo = props.logo
    this.registeredAt = props.registeredAt
    this.canRevokeCredentials = props.canRevokeCredentials
  }
}
