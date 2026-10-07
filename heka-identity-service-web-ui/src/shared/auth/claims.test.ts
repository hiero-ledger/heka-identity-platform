import { pickDisplayName } from './claims';

describe('pickDisplayName', () => {
  test('returns the first non-empty claim in order', () => {
    const claims = {
      name: 'Alice Example',
      preferred_username: 'alice',
      email: 'a@x',
    };
    expect(pickDisplayName(claims, ['preferred_username', 'name'])).toBe(
      'alice',
    );
    expect(pickDisplayName(claims, ['nickname', 'name', 'email'])).toBe(
      'Alice Example',
    );
  });

  test('skips blank and non-string values', () => {
    expect(
      pickDisplayName({ name: '  ', nickname: 42, email: 'a@x' }, [
        'name',
        'nickname',
        'email',
      ]),
    ).toBe('a@x');
  });

  test('returns null when nothing is usable', () => {
    expect(pickDisplayName({}, ['name'])).toBeNull();
    expect(pickDisplayName(undefined, ['name'])).toBeNull();
  });
});
