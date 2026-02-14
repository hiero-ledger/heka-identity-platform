import { CustomHelpers } from 'joi';
import { isStrongPassword, StrongPasswordOptions } from 'validator';

const passwordValidationRules: StrongPasswordOptions & {
  returnScore?: false | undefined;
} = {
  minLength: 7,
  minNumbers: 1,
  minSymbols: 1,
  minLowercase: 1,
  minUppercase: 1,
};

export const passwordRequirements = () =>
  `It should contain at minimum ${passwordValidationRules.minLowercase} lowercase letter, ${passwordValidationRules.minUppercase} uppercase letter, ${passwordValidationRules.minNumbers} number, ${passwordValidationRules.minSymbols} symbol and should have at minimum ${passwordValidationRules.minLength} chars length.`;

export const IsStrongPassword = (
  value: string,
  helper: CustomHelpers<string>,
) => {
  if (!isStrongPassword(value, { ...passwordValidationRules })) {
    return helper.error(`password.weak`);
  }
  return value;
};
