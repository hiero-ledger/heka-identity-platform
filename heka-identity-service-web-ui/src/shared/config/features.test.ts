import { flag } from './features';

describe('flag', () => {
  test.each([undefined, '', '   '])(
    'falls back to the default for %p',
    (value) => {
      expect(flag(value, true)).toBe(true);
      expect(flag(value, false)).toBe(false);
    },
  );

  test.each(['true', 'TRUE', ' True ', '1', 'on', 'yes'])(
    'is on for %p',
    (value) => {
      expect(flag(value, false)).toBe(true);
    },
  );

  test.each(['false', 'FALSE', ' false ', '0', 'off', 'Off'])(
    'is off for %p',
    (value) => {
      expect(flag(value, true)).toBe(false);
    },
  );
});

describe('features', () => {
  const original = process.env.REACT_APP_FEATURE_REVOCATION;

  afterEach(() => {
    if (original === undefined) delete process.env.REACT_APP_FEATURE_REVOCATION;
    else process.env.REACT_APP_FEATURE_REVOCATION = original;
    jest.resetModules();
  });

  const loadFeatures = () =>
    jest.requireActual<typeof import('./features')>('./features').features;

  test('revocation is on when REACT_APP_FEATURE_REVOCATION is unset', () => {
    delete process.env.REACT_APP_FEATURE_REVOCATION;
    jest.resetModules();
    expect(loadFeatures().revocation).toBe(true);
  });

  test('revocation is off when REACT_APP_FEATURE_REVOCATION=false', () => {
    process.env.REACT_APP_FEATURE_REVOCATION = 'false';
    jest.resetModules();
    expect(loadFeatures().revocation).toBe(false);
  });
});
