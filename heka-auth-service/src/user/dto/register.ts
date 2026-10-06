import { passwordValidationRules } from '@common/const/password.const'
import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsStrongPassword, Length } from 'class-validator'

export class RegisterUserRequest {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  public readonly name!: string

  @ApiProperty()
  @IsStrongPassword(passwordValidationRules)
  public readonly password!: string
}

export class RegisterUserResponse {}
