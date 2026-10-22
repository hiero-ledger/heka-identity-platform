import { TFunction } from 'i18next';
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

const MAX_LENGTH = 250;

/** The form's validation, with messages in the current language */
export const createSchemaFormSchema = (t: TFunction) =>
  Joi.object({
    name: Joi.string()
      .trim()
      .max(MAX_LENGTH)
      .required()
      .messages({
        'string.empty': t('CreateSchema.validation.nameRequired'),
        'string.max': t('CreateSchema.validation.nameMaxLength', {
          max: MAX_LENGTH,
        }),
      }),
    credentials: Joi.array()
      .items(
        Joi.object({
          name: Joi.string()
            .trim()
            .max(MAX_LENGTH)
            .required()
            //.pattern(/^[^"']*$/)
            .pattern(/^[A-Za-z0-9_()-]+$/)
            .messages({
              'string.pattern.base': t('CreateSchema.validation.fieldPattern'),
              'string.empty': t('CreateSchema.validation.fieldRequired'),
              'string.max': t('CreateSchema.validation.fieldMaxLength', {
                max: MAX_LENGTH,
              }),
            }),
        }),
      )
      .min(1),
  }).required();
