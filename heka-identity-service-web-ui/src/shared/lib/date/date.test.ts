import { formatDateTime } from './index';

describe('formatDateTime', () => {
  test('formats a date and time in the user locale', () => {
    const value = '2026-11-18T11:51:27Z';

    expect(formatDateTime(value)).toBe(
      new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    );
  });

  test('is empty for an unparsable value', () => {
    expect(formatDateTime('not a date')).toBe('');
  });
});
