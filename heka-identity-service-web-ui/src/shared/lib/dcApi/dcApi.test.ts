import {
  DcApiProtocolIdentifier,
  getDcApiRequestSigner,
  isDcApiSupported,
} from './index';

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

// DC_API_SIGNER / X509_CLIENT_ID_PREFIX are unset under test, so the build-time default is the DID.
describe('getDcApiRequestSigner', () => {
  it('defaults to the verifier DID when no selection is passed', () => {
    expect(getDcApiRequestSigner('did:key:z6Mk123')).toEqual({
      method: 'did',
      did: 'did:key:z6Mk123',
    });
  });

  it('returns the verifier DID for an explicit did selection', () => {
    expect(getDcApiRequestSigner('did:key:z6Mk123', { method: 'did' })).toEqual({
      method: 'did',
      did: 'did:key:z6Mk123',
    });
  });

  it('returns an x5c signer carrying clientIdPrefix and certificateId', () => {
    expect(
      getDcApiRequestSigner('did:key:z6Mk123', {
        method: 'x5c',
        clientIdPrefix: 'x509_hash',
        certificateId: 'cert-1',
      }),
    ).toEqual({
      method: 'x5c',
      clientIdPrefix: 'x509_hash',
      certificateId: 'cert-1',
    });
  });

  it('omits certificateId from the x5c signer when the selection has none', () => {
    const signer = getDcApiRequestSigner('did:key:z6Mk123', {
      method: 'x5c',
      clientIdPrefix: 'x509_san_dns',
    });

    expect(signer).toEqual({ method: 'x5c', clientIdPrefix: 'x509_san_dns' });
    expect('certificateId' in signer).toBe(false);
  });
});
