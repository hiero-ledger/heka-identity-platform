import { TFunction } from 'i18next';

import { createSchemaFormSchema } from './CreateSchema.form';

// Echoes the key and its options, so the test sees which message was looked up
const t = ((key: string, options?: { max?: number }) =>
  options?.max ? `${key}:${options.max}` : key) as unknown as TFunction;

const messagesFor = (value: unknown) =>
  createSchemaFormSchema(t)
    .validate(value, { abortEarly: false })
    .error?.details.map((detail) => detail.message);

describe('createSchemaFormSchema', () => {
  test('reports the schema name errors through translations', () => {
    expect(messagesFor({ name: '', credentials: [{ name: 'a' }] })).toEqual([
      'CreateSchema.validation.nameRequired',
    ]);
    expect(
      messagesFor({ name: 'x'.repeat(251), credentials: [{ name: 'a' }] }),
    ).toEqual(['CreateSchema.validation.nameMaxLength:250']);
  });

  test('reports the credential field errors through translations', () => {
    expect(
      messagesFor({
        name: 'Passport',
        credentials: [
          { name: '' },
          { name: 'bad name!' },
          { name: 'y'.repeat(251) },
        ],
      }),
    ).toEqual([
      'CreateSchema.validation.fieldRequired',
      'CreateSchema.validation.fieldPattern',
      'CreateSchema.validation.fieldMaxLength:250',
    ]);
  });

  test('accepts a valid schema', () => {
    expect(
      messagesFor({ name: 'Passport', credentials: [{ name: 'given_name' }] }),
    ).toBeUndefined();
  });
});
