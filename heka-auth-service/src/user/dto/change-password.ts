import { passwordValidationRules } from '@common/const/password.const'
import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsStrongPassword, Length } from 'class-validator'

export class ChangePasswordRequest {
  @ApiProperty()
  @IsStrongPassword(passwordValidationRules)
  @Length(1, 255)
  public readonly password!: string

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  public readonly token!: string
}

export class ChangePasswordResponse {}
