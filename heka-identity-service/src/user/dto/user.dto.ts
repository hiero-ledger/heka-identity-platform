import { ApiPropertyOptional } from '@nestjs/swagger'

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

  public constructor(props: Partial<UserDto>) {
    this.messageDeliveryType = props.messageDeliveryType
    this.webHook = props.webHook
    this.name = props.name
    this.backgroundColor = props.backgroundColor
    this.logo = props.logo
    this.registeredAt = props.registeredAt
  }
}
