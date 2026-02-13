import Joi from 'joi';

export interface SignInFormData {
  username: string;
  password: string;
}

export const SignInFormSchema = Joi.object({
  username: Joi.string().trim().max(255).required().messages({
    'string.empty': 'User name is required',
  }),
  password: Joi.string().required().max(255).messages({
    'string.empty': 'Password is required',
  }),
}).required();

export const SingInFormDefaultValues = {
  username: '',
  password: '',
};
