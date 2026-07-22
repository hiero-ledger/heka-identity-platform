// The static `DigitalCredential.userAgentAllowsProtocol(protocol)` predicate allows a site to ask
// whether the browser can route a given DC API protocol. Not in lib.dom.d.ts yet, so it is typed locally.
type DigitalCredentialStatic = {
  userAgentAllowsProtocol?: (protocol: string) => boolean;
};

export enum DcApiProtocolIdentifier {
  OpenId4VpV1Signed = 'openid4vp-v1-signed',
  OpenId4VpV1Unsigned = 'openid4vp-v1-unsigned',
}

export const isDcApiSupported = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const apiIsSupported =
    'credentials' in navigator &&
    typeof navigator.credentials?.get === 'function' &&
    'DigitalCredential' in window;

  if (!apiIsSupported) {
    return false;
  }

  // Desktop Chrome exposes the interface too (cross-device flow), so the check above already
  // lights up on desktop. Where the browser can tell us, also require that it routes the exact
  // protocol id we emit — otherwise the picker would never offer a wallet for our requests.
  const digitalCredential = (
    window as unknown as {
      DigitalCredential?: DigitalCredentialStatic;
    }
  ).DigitalCredential;

  if (typeof digitalCredential?.userAgentAllowsProtocol === 'function') {
    return digitalCredential.userAgentAllowsProtocol(
      DcApiProtocolIdentifier.OpenId4VpV1Unsigned,
    );
  }

  return true;
};
