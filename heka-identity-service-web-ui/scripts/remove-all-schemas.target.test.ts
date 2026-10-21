import { describeTarget, resolveOptions } from './remove-all-schemas.target';

describe('remove-all-schemas target', () => {
  const env = { MIKRO_ORM_PASSWORD: 'secret' };

  test('defaults to the local identity service database', () => {
    expect(resolveOptions(env, [])).toEqual({
      target: {
        host: 'localhost',
        port: 5432,
        user: 'heka',
        password: 'secret',
        database: 'heka-identity-service',
      },
      confirmed: false,
    });
  });

  test('deletes only with --yes', () => {
    expect(resolveOptions(env, ['--yes']).confirmed).toBe(true);
  });

  test('requires the password instead of falling back to a default', () => {
    expect(() => resolveOptions({}, ['--yes'])).toThrow(
      /MIKRO_ORM_PASSWORD is not set/,
    );
  });

  test.each(['localhost', '127.0.0.1', '::1'])(
    'accepts local host %s',
    (host) => {
      expect(
        resolveOptions({ ...env, MIKRO_ORM_HOST: host }, ['--yes']).target.host,
      ).toBe(host);
    },
  );

  test('refuses a non-local host', () => {
    expect(() =>
      resolveOptions({ ...env, MIKRO_ORM_HOST: 'db.staging.example' }, [
        '--yes',
      ]),
    ).toThrow(/Refusing to run against non-local host "db.staging.example"/);
  });

  test('accepts a non-local host with --allow-remote', () => {
    expect(
      resolveOptions({ ...env, MIKRO_ORM_HOST: 'db.staging.example' }, [
        '--allow-remote',
      ]).target.host,
    ).toBe('db.staging.example');
  });

  test('rejects an invalid port', () => {
    expect(() => resolveOptions({ ...env, MIKRO_ORM_PORT: 'abc' }, [])).toThrow(
      /MIKRO_ORM_PORT is not a valid port/,
    );
  });

  test('describes the target without the password', () => {
    const { target } = resolveOptions(env, []);
    expect(describeTarget(target)).toBe(
      'heka@localhost:5432/heka-identity-service',
    );
    expect(describeTarget(target)).not.toContain('secret');
  });
});
