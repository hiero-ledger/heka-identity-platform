import { passwordValidationRules } from '@common/const/password.const'
import { ApiProperty } from '@nestjs/swagger'
import { IsStrongPassword, Length } from 'class-validator'

export class RegisterUserRequest {
  @ApiProperty()
  @Length(1, 255)
  public readonly name!: string

  @ApiProperty()
  @IsStrongPassword(passwordValidationRules)
  public readonly password!: string
}

export class RegisterUserResponse {}
