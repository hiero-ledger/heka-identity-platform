import Joi from 'joi';

import {
  IsStrongPassword,
  passwordRequirements,
} from '@/shared/validators/password';

export interface ChangePasswordFieldFormData {
  password: string;
  passwordRepeat: string;
  oldPassword: string;
}

export const ChangePasswordFieldFormSchema = Joi.object({
  oldPassword: Joi.string().max(255).required().messages({
    'string.empty': 'Please enter current password',
  }),
  password: Joi.string()
    .invalid(Joi.ref('oldPassword'))
    .max(255)
    .required()
    .custom(IsStrongPassword)
    .messages({
      'string.max': 'Password length must be at most 255 characters long',
      'string.empty': 'Password is required',
      'any.invalid': 'Password matches old',
      'password.weak': `Password is not strong enough. ${passwordRequirements()}`,
    }),
  passwordRepeat: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords must match',
  }),
}).required();

export const defaultChangePasswordFieldFormValues: ChangePasswordFieldFormData =
  {
    password: '',
    passwordRepeat: '',
    oldPassword: '',
  };
