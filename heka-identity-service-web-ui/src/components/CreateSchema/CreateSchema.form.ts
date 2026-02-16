import Joi from 'joi';

export interface Credential {
  name: string;
}

export interface CreateSchemaFormData {
  name: string;
  credentials: Credential[];
}

export const CreateSchemaFormDefaultValues = {
  name: '',
  credentials: [],
} as CreateSchemaFormData;

export const CreateSchemaFormSchema = Joi.object({
  name: Joi.string().trim().max(250).required().messages({
    'string.empty': 'Schema name is required',
    'string.max':
      'Schema name length must be less than or equal to 250 characters long',
  }),
  credentials: Joi.array()
    .items(
      Joi.object({
        name: Joi.string()
          .trim()
          .max(250)
          .required()
          //.pattern(/^[^"']*$/)
          .pattern(/^[A-Za-z0-9_()-]+$/)
          .messages({
            'string.pattern.base':
              'Credential field must contain only latin chars, digits, parentheses, underscores and dashes',
            'string.empty': 'Credential field is required',
            'string.max':
              'Credential field length must be less than or equal to 250 characters long',
          }),
      }),
    )
    .min(1),
}).required();
