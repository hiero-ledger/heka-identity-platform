import { UserRole } from '@core/database'
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty } from 'class-validator'

export class UpdateUserRoleRequest {
  @ApiProperty({ enum: UserRole, description: 'New role to assign to the user' })
  @IsNotEmpty()
  @IsEnum(UserRole)
  public readonly role!: UserRole
}

export class UpdateUserRoleResponse {
  @ApiProperty({ description: 'User ID' })
  public readonly id!: string

  @ApiProperty({ enum: UserRole, description: 'Updated role' })
  public readonly role!: UserRole

  public constructor(props: UpdateUserRoleResponse) {
    this.id = props.id
    this.role = props.role
  }
}
