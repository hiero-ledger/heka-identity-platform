import { flag } from './features';

describe('flag', () => {
  test.each([undefined, '', '   '])(
    'falls back to the default for %p',
    (value) => {
      expect(flag('FLAG', value, true)).toBe(true);
      expect(flag('FLAG', value, false)).toBe(false);
    },
  );

  test.each(['true', 'TRUE', ' True '])('is on for %p', (value) => {
    expect(flag('FLAG', value, false)).toBe(true);
  });

  test.each(['false', 'FALSE', ' false '])('is off for %p', (value) => {
    expect(flag('FLAG', value, true)).toBe(false);
  });

  test.each(['1', '0', 'on', 'off', 'yes', 'no', 'flase', 'disabled'])(
    'rejects %p, naming the variable',
    (value) => {
      expect(() => flag('REACT_APP_FEATURE_X', value, true)).toThrow(
        `REACT_APP_FEATURE_X must be "true" or "false", got "${value}"`,
      );
    },
  );
});

describe('features', () => {
  const original = process.env.REACT_APP_FEATURE_REVOCATION;
  const originalContributor =
    process.env.REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION;

  afterEach(() => {
    if (original === undefined) delete process.env.REACT_APP_FEATURE_REVOCATION;
    else process.env.REACT_APP_FEATURE_REVOCATION = original;
    if (originalContributor === undefined)
      delete process.env.REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION;
    else
      process.env.REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION =
        originalContributor;
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

  test('contributor verification is off when REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION is unset', () => {
    delete process.env.REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION;
    jest.resetModules();
    expect(loadFeatures().contributorVerification).toBe(false);
  });

  test('contributor verification is on when REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION=true', () => {
    process.env.REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION = 'true';
    jest.resetModules();
    expect(loadFeatures().contributorVerification).toBe(true);
  });

  test('a value other than true or false fails at load', () => {
    process.env.REACT_APP_FEATURE_REVOCATION = 'off';
    jest.resetModules();
    expect(loadFeatures).toThrow(
      'REACT_APP_FEATURE_REVOCATION must be "true" or "false"',
    );
  });
});
