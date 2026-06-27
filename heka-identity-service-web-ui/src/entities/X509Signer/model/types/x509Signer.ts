import { X509ClientIdPrefix } from '@/shared/lib/dcApi';

/**
 * A verifier X.509 signer, as returned by `GET /x509/signers`. Only the
 * fields the presentation-flow signer picker needs are modelled here (the backend DTO carries more,
 * e.g. `certificateBase64`).
 */
export interface X509Signer {
  id: string;
  clientIdPrefix: X509ClientIdPrefix;
  fingerprint: string;
  did?: string;
  commonName?: string;
  sanDnsName?: string;
  isDefault: boolean;
  expiresInDays: number;
  expired: boolean;
}
