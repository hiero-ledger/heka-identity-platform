import { DcApiProtocolIdentifier, isDcApiSupported } from './index';

describe('isDcApiSupported', () => {
  const originalCredentials = Object.getOwnPropertyDescriptor(
    global.navigator,
    'credentials',
  );

  const setCredentials = () => {
    Object.defineProperty(global.navigator, 'credentials', {
      value: { get: () => undefined },
      configurable: true,
      writable: true,
    });
  };

  const setDigitalCredential = (value: unknown) => {
    (global.window as unknown as Record<string, unknown>).DigitalCredential =
      value;
  };

  const clearDigitalCredential = () => {
    delete (global.window as unknown as Record<string, unknown>)
      .DigitalCredential;
  };

  afterEach(() => {
    clearDigitalCredential();
    if (originalCredentials) {
      Object.defineProperty(
        global.navigator,
        'credentials',
        originalCredentials,
      );
    } else {
      delete (global.navigator as unknown as Record<string, unknown>)
        .credentials;
    }
  });

  it('returns false when the DigitalCredential interface is absent', () => {
    setCredentials();
    clearDigitalCredential();
    expect(isDcApiSupported()).toBe(false);
  });

  it('assumes allowed when userAgentAllowsProtocol is unavailable (older Chrome)', () => {
    setCredentials();
    setDigitalCredential({}); // interface present, no protocol predicate
    expect(isDcApiSupported()).toBe(true);
  });

  it('honours userAgentAllowsProtocol for the configured protocol id', () => {
    setCredentials();
    const userAgentAllowsProtocol = jest.fn().mockReturnValue(true);
    setDigitalCredential({ userAgentAllowsProtocol });
    expect(isDcApiSupported()).toBe(true);
    expect(userAgentAllowsProtocol).toHaveBeenCalledWith(
      DcApiProtocolIdentifier.OpenId4VpV1Unsigned,
    );
  });

  it('returns false when the browser cannot route our protocol id', () => {
    setCredentials();
    setDigitalCredential({ userAgentAllowsProtocol: () => false });
    expect(isDcApiSupported()).toBe(false);
  });
});
