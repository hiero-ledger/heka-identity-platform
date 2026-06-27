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

export type X509ClientIdPrefix = 'x509_hash' | 'x509_san_dns';

/**
 * How the verifier signs `dc_api` authorization requests, as sent to the backend.
 *
 * - `did` — sign with the verifier DID (`requestSigner: { method: 'did', did }`).
 * - `x5c` — sign with the verifier's X.509 signer. The backend resolves the certificate
 *   from `certificateId` when given, else the tenant's default identity for `clientIdPrefix`.
 */
export type DcApiRequestSigner =
  | { method: 'did'; did: string }
  | { method: 'x5c'; clientIdPrefix: X509ClientIdPrefix; certificateId?: string };

/**
 * A runtime signer choice from the presentation flow's picker. Unlike {@link DcApiRequestSigner}, the
 * `did` variant carries no `did` — it is resolved at build time from the verifier id (see
 * {@link getDcApiRequestSigner}). `undefined` means "use the build-time `.env` default".
 */
export type RequestSignerSelection =
  | { method: 'did' }
  | { method: 'x5c'; clientIdPrefix: X509ClientIdPrefix; certificateId?: string };

const dcApiSignerMethod = process.env.DC_API_SIGNER === 'x5c' ? 'x5c' : 'did';

const x509ClientIdPrefix: X509ClientIdPrefix =
  process.env.X509_CLIENT_ID_PREFIX === 'x509_san_dns' ? 'x509_san_dns' : 'x509_hash';

/**
 * The build-time default signer, set via `.env` (`DC_API_SIGNER`, `X509_CLIENT_ID_PREFIX`). Used when
 * the presentation flow does not pick a signer explicitly. Opting into `x5c` requires an X.509 signer to be provisioned first (POST /x509/signers).
 */
const envDefaultSelection: RequestSignerSelection =
  dcApiSignerMethod === 'x5c'
    ? { method: 'x5c', clientIdPrefix: x509ClientIdPrefix }
    : { method: 'did' };

export const getDcApiRequestSigner = (
  did: string,
  selection: RequestSignerSelection = envDefaultSelection,
): DcApiRequestSigner =>
  selection.method === 'x5c'
    ? {
        method: 'x5c',
        clientIdPrefix: selection.clientIdPrefix,
        ...(selection.certificateId ? { certificateId: selection.certificateId } : {}),
      }
    : { method: 'did', did };
