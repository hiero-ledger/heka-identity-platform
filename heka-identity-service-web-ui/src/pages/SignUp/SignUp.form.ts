import Joi from 'joi';

import {
  IsStrongPassword,
  passwordRequirements,
} from '@/shared/validators/password';

export interface SignUpFormData {
  username: string;
  password: string;
  passwordRepeat: string;
}

export const SignUpFormSchema = Joi.object({
  username: Joi.string().trim().max(255).required().messages({
    'string.empty': 'User name is required',
  }),
  password: Joi.string()
    .required()
    .max(255)
    .custom(IsStrongPassword)
    .messages({
      'string.empty': 'Password is required',
      'password.weak': `Password is not strong enough. ${passwordRequirements()}`,
    }),
  passwordRepeat: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .options({
      messages: {
        'string.empty': 'Password is required',
        'any.only': 'Passwords must match',
      },
    }),
}).required();

export const SingUpFormDefaultValues = {
  username: '',
  password: '',
  passwordRepeat: '',
};
