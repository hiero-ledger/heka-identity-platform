import Joi from 'joi';

export interface TemplateFormData {
  name: string;
}

export const TemplateFormDefaultValues = {
  name: '',
};

export const TemplateFieldValidation = Joi.object({
  name: Joi.string().trim().max(250).trim().required().messages({
    'string.empty': 'Template name is required',
  }),
}).required();
