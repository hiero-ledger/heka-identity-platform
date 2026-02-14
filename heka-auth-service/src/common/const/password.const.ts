import { IsStrongPasswordOptions } from 'class-validator/types/decorator/string/IsStrongPassword'

export const passwordValidationRules: IsStrongPasswordOptions = {
  minLength: 7,
  minNumbers: 1,
  minSymbols: 1,
  minLowercase: 1,
  minUppercase: 1,
}