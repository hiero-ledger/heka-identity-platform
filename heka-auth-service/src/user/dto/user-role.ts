import { UserRole } from '@core/database'
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'

export class UserRoleItem {
  @ApiProperty()
  public readonly id!: string

  @ApiProperty()
  public readonly name!: string

  @ApiProperty({ enum: UserRole })
  public readonly role!: UserRole

  constructor(props: UserRoleItem) {
    this.id = props.id
    this.name = props.name
    this.role = props.role
  }
}

export class ListUsersResponse {
  @ApiProperty({ type: [UserRoleItem] })
  public readonly items!: UserRoleItem[]

  constructor(items: UserRoleItem[]) {
    this.items = items
  }
}

export class UpdateUserRoleRequest {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  public readonly role!: UserRole
}
