import { passwordValidationRules } from '@common/const/password.const'
import { UserRole } from '@core/database'
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsStrongPassword, Length } from 'class-validator'

export class RegisterUserRequest {
  @ApiProperty()
  @Length(1, 255)
  public readonly name!: string

  @ApiProperty()
  @IsStrongPassword(passwordValidationRules)
  public readonly password!: string

  @ApiProperty({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  public readonly role?: UserRole
}

export class RegisterUserResponse {}
