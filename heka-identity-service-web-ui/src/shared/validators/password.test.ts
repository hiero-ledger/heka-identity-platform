import Joi from 'joi';

import { IsStrongPassword, passwordRequirements } from './password';

const schema = Joi.string()
  .custom(IsStrongPassword)
  .messages({ 'password.weak': passwordRequirements() });

describe('IsStrongPassword', () => {
  test.each(['Abcdef1!', 'Zz9#zzzz'])('accepts %s', (password) => {
    const { error, value } = schema.validate(password);

    expect(error).toBeUndefined();
    expect(value).toBe(password);
  });

  test.each([
    ['too short', 'Ab1!'],
    ['no number', 'Abcdefg!'],
    ['no symbol', 'Abcdefg1'],
    ['no uppercase', 'abcdef1!'],
    ['no lowercase', 'ABCDEF1!'],
  ])('rejects a password with %s', (_reason, password) => {
    const { error } = schema.validate(password);

    expect(error?.details[0].type).toBe('password.weak');
    expect(error?.message).toBe(passwordRequirements());
  });
});

describe('passwordRequirements', () => {
  test('describes the rules', () => {
    expect(passwordRequirements()).toBe(
      'It should contain at minimum 1 lowercase letter, 1 uppercase letter, 1 number, 1 symbol and should have at minimum 7 chars length.',
    );
  });
});
