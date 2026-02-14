import Joi from 'joi';

import { SchemaField } from '@/entities/Schema/model/types/schema';

export const buildFormData = (attributes?: SchemaField[]) => {
  const object: Record<string, Joi.StringSchema> = {};
  attributes?.forEach((attr) => {
    object[attr.name] = Joi.string()
      .trim()
      .max(255)
      .required()
      .options({
        messages: {
          'string.base': `${attr.name} is required`,
          'string.empty': `${attr.name} is required`,
        },
        errors: {
          wrap: {
            label: false,
          },
        },
      });
  });
  return Joi.object(object).required();
};
